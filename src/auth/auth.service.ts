import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

// Tenant a login defaults to when the client sends no explicit slug.
const DEFAULT_TENANT_SLUG = 'default';

// Dummy bcrypt hash used for constant-time comparison on the not-found path.
const INVALID_HASH =
  '$2b$12$invalidhashtopreventtiming000000000000000000000000';

const AVATAR_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const LOGO_MIME_TO_EXT: Record<string, string> = {
  ...AVATAR_MIME_TO_EXT,
  'image/svg+xml': 'svg',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    username: string,
    password: string,
    tenantSlug: string = DEFAULT_TENANT_SLUG,
  ): Promise<LoginResult> {
    // Resolve the tenant first — username is only unique within a tenant.
    const slug = tenantSlug?.trim() || DEFAULT_TENANT_SLUG;
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });

    if (!tenant) {
      // Constant-time response to avoid leaking which tenants exist.
      await bcrypt.compare(password, INVALID_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_username: { tenantId: tenant.id, username } },
    });

    if (!user) {
      // Constant-time response to prevent username enumeration
      await bcrypt.compare(password, INVALID_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = this.jwt.sign(payload);

    this.logger.log(
      `User "${user.username}" (id=${user.id}, tenant=${slug}) logged in`,
    );

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async getMe(userId: number): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  // ─── Profile ─────────────────────────────────────────────────────────────

  async getProfile(userId: number): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return this.toProfile(user);
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    if (dto.defaultLanguage === undefined && dto.soundEnabled === undefined) {
      throw new BadRequestException(
        'Provide at least one field (defaultLanguage or soundEnabled)',
      );
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.defaultLanguage !== undefined && {
            defaultLanguage: dto.defaultLanguage,
          }),
          ...(dto.soundEnabled !== undefined && {
            soundEnabled: dto.soundEnabled,
          }),
        },
      });
      return this.toProfile(updated);
    } catch (e) {
      if (isPrismaNotFound(e)) {
        throw new NotFoundException(`User ${userId} not found`);
      }
      throw e;
    }
  }

  async uploadAvatar(
    userId: number,
    file: Express.Multer.File | undefined,
  ): Promise<ProfileResponseDto> {
    const ext = this.validateAndExt(file, AVATAR_MIME_TO_EXT, 'avatar');
    const relativePath = await this.saveProfileImage(
      userId,
      file!,
      'avatars',
      ext,
    );

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: relativePath },
      });
      return this.toProfile(updated);
    } catch (e) {
      // DB failed after writing the file — clean up to avoid orphans.
      await this.safeDeleteFile(join(process.cwd(), relativePath));
      if (isPrismaNotFound(e)) {
        throw new NotFoundException(`User ${userId} not found`);
      }
      throw e;
    }
  }

  async uploadLogo(
    userId: number,
    file: Express.Multer.File | undefined,
  ): Promise<ProfileResponseDto> {
    const ext = this.validateAndExt(file, LOGO_MIME_TO_EXT, 'logo');
    const relativePath = await this.saveProfileImage(
      userId,
      file!,
      'logos',
      ext,
    );

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { logoUrl: relativePath },
      });
      return this.toProfile(updated);
    } catch (e) {
      await this.safeDeleteFile(join(process.cwd(), relativePath));
      if (isPrismaNotFound(e)) {
        throw new NotFoundException(`User ${userId} not found`);
      }
      throw e;
    }
  }

  private toProfile(user: {
    id: number;
    tenantId: number;
    username: string;
    role: string;
    avatarUrl: string | null;
    logoUrl: string | null;
    defaultLanguage: string;
    soundEnabled: boolean;
  }): ProfileResponseDto {
    return {
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl,
      logoUrl: user.logoUrl,
      defaultLanguage: user.defaultLanguage,
      soundEnabled: user.soundEnabled,
    };
  }

  private validateAndExt(
    file: Express.Multer.File | undefined,
    allowed: Record<string, string>,
    kind: 'avatar' | 'logo',
  ): string {
    if (!file?.buffer?.length) {
      throw new BadRequestException(`${kind} file is required`);
    }
    const ext = allowed[file.mimetype];
    if (!ext) {
      const list = Object.keys(allowed).join(', ');
      throw new BadRequestException(
        `Unsupported ${kind} mime type "${file.mimetype}". Allowed: ${list}`,
      );
    }
    return ext;
  }

  private async saveProfileImage(
    userId: number,
    file: Express.Multer.File,
    subdir: 'avatars' | 'logos',
    ext: string,
  ): Promise<string> {
    const dir = join(process.cwd(), 'storage', subdir);
    await fs.mkdir(dir, { recursive: true });

    // Remove any prior file for this user to avoid orphans from ext changes.
    await this.clearExistingProfileImage(userId, subdir);

    const filename = `${userId}-${subdir.slice(0, -1)}.${ext}`;
    const absolutePath = join(dir, filename);
    await fs.writeFile(absolutePath, file.buffer);

    return join('storage', subdir, filename).replace(/\\/g, '/');
  }

  private async clearExistingProfileImage(
    userId: number,
    subdir: 'avatars' | 'logos',
  ): Promise<void> {
    const dir = join(process.cwd(), 'storage', subdir);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    const prefix = `${userId}-${subdir.slice(0, -1)}.`;
    await Promise.all(
      entries
        .filter((name) => name.startsWith(prefix))
        .map((name) => this.safeDeleteFile(join(dir, name))),
    );
  }

  private async safeDeleteFile(absolutePath: string): Promise<void> {
    try {
      await fs.unlink(absolutePath);
    } catch {
      /* ignore */
    }
  }
}

function isPrismaNotFound(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2025'
  );
}
