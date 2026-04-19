import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

// Hoisted mock references so they exist before vi.mock factories run.
const { mockMkdir, mockWriteFile, mockUnlink, mockReaddir, mockBcryptCompare } =
  vi.hoisted(() => ({
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
    mockUnlink: vi.fn(),
    mockReaddir: vi.fn(),
    mockBcryptCompare: vi.fn(),
  }));

// Mock fs so no real files are written. Preserve the real module for other uses.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: mockMkdir,
      writeFile: mockWriteFile,
      unlink: mockUnlink,
      readdir: mockReaddir,
    },
  };
});

vi.mock('bcrypt', () => ({
  compare: (pw: string, hash: string) => mockBcryptCompare(pw, hash),
}));

// ─── helpers ────────────────────────────────────────────────────────────────
const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  username: 'alice',
  passwordHash: '$2b$12$hash',
  role: 'user',
  avatarUrl: null,
  logoUrl: null,
  defaultLanguage: 'en',
  soundEnabled: true,
  createdAt: new Date('2026-04-17T10:00:00.000Z'),
  ...overrides,
});

const makeImageFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  fieldname: 'avatar',
  originalname: 'pic.png',
  encoding: '7bit',
  mimetype: 'image/png',
  size: 1234,
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

// ─── mocks ──────────────────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

const mockJwt = {
  sign: vi.fn().mockReturnValue('signed.jwt.token'),
};

// ─── suite ──────────────────────────────────────────────────────────────────
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockJwt.sign.mockReturnValue('signed.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── login ────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('should return accessToken and user info on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockBcryptCompare.mockResolvedValue(true);

      const result = await service.login('alice', 'pw');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({ id: 1, username: 'alice', role: 'user' });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockBcryptCompare.mockResolvedValue(false);

      await expect(service.login('ghost', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockBcryptCompare.mockResolvedValue(false);

      await expect(service.login('alice', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── getProfile ───────────────────────────────────────────────────────────
  describe('getProfile', () => {
    it('should return all profile fields for an existing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ avatarUrl: 'storage/avatars/1-avatar.png', soundEnabled: false }),
      );

      const result = await service.getProfile(1);

      expect(result).toEqual({
        id: 1,
        username: 'alice',
        role: 'user',
        avatarUrl: 'storage/avatars/1-avatar.png',
        logoUrl: null,
        defaultLanguage: 'en',
        soundEnabled: false,
      });
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────
  describe('updateProfile', () => {
    it('should update defaultLanguage only when provided', async () => {
      mockPrisma.user.update.mockResolvedValue(
        makeUser({ defaultLanguage: 'de' }),
      );

      const result = await service.updateProfile(1, { defaultLanguage: 'de' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { defaultLanguage: 'de' },
      });
      expect(result.defaultLanguage).toBe('de');
    });

    it('should update soundEnabled only when provided', async () => {
      mockPrisma.user.update.mockResolvedValue(
        makeUser({ soundEnabled: false }),
      );

      const result = await service.updateProfile(1, { soundEnabled: false });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { soundEnabled: false },
      });
      expect(result.soundEnabled).toBe(false);
    });

    it('should update both fields when both are provided', async () => {
      mockPrisma.user.update.mockResolvedValue(
        makeUser({ defaultLanguage: 'de', soundEnabled: false }),
      );

      await service.updateProfile(1, { defaultLanguage: 'de', soundEnabled: false });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { defaultLanguage: 'de', soundEnabled: false },
      });
    });

    it('should throw BadRequestException when no fields are provided', async () => {
      await expect(service.updateProfile(1, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should map Prisma P2025 to NotFoundException', async () => {
      mockPrisma.user.update.mockRejectedValue(
        Object.assign(new Error('not found'), { code: 'P2025' }),
      );

      await expect(
        service.updateProfile(99, { soundEnabled: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── uploadAvatar ─────────────────────────────────────────────────────────
  describe('uploadAvatar', () => {
    it('should persist the image and set avatarUrl to the relative storage path', async () => {
      mockPrisma.user.update.mockResolvedValue(
        makeUser({ avatarUrl: 'storage/avatars/1-avatar.png' }),
      );

      const result = await service.uploadAvatar(1, makeImageFile());

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [absPath] = mockWriteFile.mock.calls[0];
      // Accept both / and \ on Windows
      expect(String(absPath).replace(/\\/g, '/')).toMatch(
        /storage\/avatars\/1-avatar\.png$/,
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { avatarUrl: 'storage/avatars/1-avatar.png' },
      });
      expect(result.avatarUrl).toBe('storage/avatars/1-avatar.png');
    });

    it('should remove previous avatar files for the same user before saving', async () => {
      mockReaddir.mockResolvedValue(['1-avatar.jpg', '2-avatar.png', '1-avatar.webp']);
      mockPrisma.user.update.mockResolvedValue(
        makeUser({ avatarUrl: 'storage/avatars/1-avatar.png' }),
      );

      await service.uploadAvatar(1, makeImageFile());

      // Should only remove files starting with "1-avatar." — not other users'.
      expect(mockUnlink).toHaveBeenCalledTimes(2);
      const removed = mockUnlink.mock.calls.map(([p]) => String(p).replace(/\\/g, '/'));
      expect(removed.some((p) => p.endsWith('1-avatar.jpg'))).toBe(true);
      expect(removed.some((p) => p.endsWith('1-avatar.webp'))).toBe(true);
      expect(removed.some((p) => p.endsWith('2-avatar.png'))).toBe(false);
    });

    it('should map webp and jpeg to correct extensions', async () => {
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await service.uploadAvatar(1, makeImageFile({ mimetype: 'image/webp' }));
      await service.uploadAvatar(1, makeImageFile({ mimetype: 'image/jpeg' }));

      const writes = mockWriteFile.mock.calls.map(([p]) => String(p).replace(/\\/g, '/'));
      expect(writes[0]).toMatch(/1-avatar\.webp$/);
      expect(writes[1]).toMatch(/1-avatar\.jpg$/);
    });

    it('should throw BadRequestException for missing file', async () => {
      await expect(service.uploadAvatar(1, undefined)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should reject unsupported mime types for avatars (e.g. svg)', async () => {
      await expect(
        service.uploadAvatar(1, makeImageFile({ mimetype: 'image/svg+xml' })),
      ).rejects.toThrow(BadRequestException);
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should delete the written file and surface NotFoundException when the DB update fails with P2025', async () => {
      mockPrisma.user.update.mockRejectedValue(
        Object.assign(new Error('not found'), { code: 'P2025' }),
      );

      await expect(service.uploadAvatar(99, makeImageFile())).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUnlink).toHaveBeenCalled();
    });
  });

  // ─── uploadLogo ───────────────────────────────────────────────────────────
  describe('uploadLogo', () => {
    it('should accept image/svg+xml for logos', async () => {
      mockPrisma.user.update.mockResolvedValue(
        makeUser({ logoUrl: 'storage/logos/1-logo.svg' }),
      );

      const result = await service.uploadLogo(
        1,
        makeImageFile({ mimetype: 'image/svg+xml', originalname: 'logo.svg' }),
      );

      expect(result.logoUrl).toBe('storage/logos/1-logo.svg');
      const writePath = String(mockWriteFile.mock.calls[0][0]).replace(/\\/g, '/');
      expect(writePath).toMatch(/storage\/logos\/1-logo\.svg$/);
    });

    it('should reject unsupported logo mime types', async () => {
      await expect(
        service.uploadLogo(1, makeImageFile({ mimetype: 'application/pdf' })),
      ).rejects.toThrow(BadRequestException);
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });
});
