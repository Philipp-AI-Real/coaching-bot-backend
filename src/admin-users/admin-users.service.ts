import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  UserSortBy,
} from './admin-users.constants';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface AdminUsersListData {
  items: AdminUserResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// All methods are scoped to the caller's tenantId (including superadmin, MVP).
// A user id in another tenant is treated as not found — never a cross-tenant leak.
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toResponse(user: User): AdminUserResponseDto {
    return {
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      role: user.role,
      defaultLanguage: user.defaultLanguage,
      soundEnabled: user.soundEnabled,
      avatarUrl: user.avatarUrl,
      logoUrl: user.logoUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async create(
    tenantId: number,
    dto: CreateUserDto,
  ): Promise<AdminUserResponseDto> {
    const username = dto.username.trim();
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    try {
      const created = await this.prisma.user.create({
        data: {
          tenantId,
          username,
          passwordHash,
          role: dto.role ?? 'user',
          defaultLanguage: dto.defaultLanguage ?? 'en',
          soundEnabled: dto.soundEnabled ?? true,
        },
      });
      this.logger.log(
        `Created user "${username}" (id=${created.id}) in tenant ${tenantId}`,
      );
      return this.toResponse(created);
    } catch (e) {
      // Unique constraint on (tenantId, username).
      if (isUniqueViolation(e)) {
        throw new BadRequestException(
          'A user with this username already exists in this tenant.',
        );
      }
      throw e;
    }
  }

  async findAll(
    tenantId: number,
    query: ListUsersQueryDto,
  ): Promise<AdminUsersListData> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = { tenantId };
    if (query.search) {
      where.username = { contains: query.search, mode: 'insensitive' };
    }

    const sortBy = (query.sortBy as UserSortBy) ?? 'createdAt';
    const sortOrder: Prisma.SortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.UserOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, skip, take: limit }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => this.toResponse(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(
    id: number,
    tenantId: number,
  ): Promise<AdminUserResponseDto> {
    return this.toResponse(await this.findInTenantOr404(id, tenantId));
  }

  async update(
    id: number,
    tenantId: number,
    dto: UpdateUserDto,
  ): Promise<AdminUserResponseDto> {
    if (
      dto.role === undefined &&
      dto.defaultLanguage === undefined &&
      dto.soundEnabled === undefined
    ) {
      throw new BadRequestException('Provide at least one field to update.');
    }

    await this.findInTenantOr404(id, tenantId);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.defaultLanguage !== undefined && {
          defaultLanguage: dto.defaultLanguage,
        }),
        ...(dto.soundEnabled !== undefined && {
          soundEnabled: dto.soundEnabled,
        }),
      },
    });
    return this.toResponse(updated);
  }

  async resetPassword(
    id: number,
    tenantId: number,
    newPassword: string,
  ): Promise<AdminUserResponseDto> {
    await this.findInTenantOr404(id, tenantId);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    this.logger.log(`Password reset for user id=${id} in tenant ${tenantId}`);
    return this.toResponse(updated);
  }

  async remove(
    id: number,
    tenantId: number,
    requesterId: number,
  ): Promise<number> {
    if (id === requesterId) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    await this.findInTenantOr404(id, tenantId);
    // Chat messages + coaching items cascade via the schema (onDelete: Cascade).
    await this.prisma.user.delete({ where: { id } });
    this.logger.log(`Deleted user id=${id} in tenant ${tenantId}`);
    return id;
  }

  // findFirst with id + tenantId so another tenant's id returns 404 (no leak).
  private async findInTenantOr404(
    id: number,
    tenantId: number,
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}
