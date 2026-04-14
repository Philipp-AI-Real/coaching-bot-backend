import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user) {
      // Constant-time response to prevent username enumeration
      await bcrypt.compare(password, '$2b$12$invalidhashtopreventtiming000000000000000000000000');
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
    };

    const accessToken = this.jwt.sign(payload);

    this.logger.log(`User "${user.username}" (id=${user.id}) logged in`);

    return {
      accessToken,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  async getMe(userId: number): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return { id: user.id, username: user.username, role: user.role };
  }
}
