import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── helpers ──────────────────────────────────────────────────────────────────
const TENANT_ID = 3;
const OTHER_TENANT_ID = 9;
const ADMIN_ID = 1;

const makeUser = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 42,
  tenantId: TENANT_ID,
  username: 'patient1',
  passwordHash: 'hashed',
  role: 'user',
  avatarUrl: null,
  logoUrl: null,
  defaultLanguage: 'en',
  soundEnabled: true,
  createdAt: new Date('2026-07-31T08:00:00.000Z'),
  ...over,
});

// ─── mocks ────────────────────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.user.create.mockResolvedValue(makeUser());
    mockPrisma.user.findMany.mockResolvedValue([makeUser()]);
    mockPrisma.user.findFirst.mockResolvedValue(makeUser());
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.update.mockResolvedValue(makeUser());
    mockPrisma.user.delete.mockResolvedValue(makeUser());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  // ─── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('hashes the password and stamps the caller tenantId', async () => {
      await service.create(TENANT_ID, { username: 'patient1', password: 'secret12' });

      const arg = mockPrisma.user.create.mock.calls[0][0];
      expect(arg.data.tenantId).toBe(TENANT_ID);
      expect(arg.data.role).toBe('user'); // default
      expect(arg.data.passwordHash).not.toBe('secret12');
      await expect(bcrypt.compare('secret12', arg.data.passwordHash)).resolves.toBe(true);
    });

    it('never returns the password hash', async () => {
      const res = await service.create(TENANT_ID, {
        username: 'patient1',
        password: 'secret12',
      });
      expect(res).not.toHaveProperty('passwordHash');
    });

    it('maps a unique-constraint violation to a 400', async () => {
      mockPrisma.user.create.mockRejectedValueOnce({ code: 'P2002' });
      await expect(
        service.create(TENANT_ID, { username: 'patient1', password: 'secret12' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('scopes the query to the caller tenant and paginates', async () => {
      const res = await service.findAll(TENANT_ID, { page: 2, limit: 5 });

      const arg = mockPrisma.user.findMany.mock.calls[0][0];
      expect(arg.where.tenantId).toBe(TENANT_ID);
      expect(arg.skip).toBe(5); // (2-1)*5
      expect(arg.take).toBe(5);
      expect(res.totalPages).toBe(1);
    });
  });

  // ─── tenant isolation ─────────────────────────────────────────────────────
  describe('tenant isolation', () => {
    it('returns 404 for a user in another tenant', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(42, OTHER_TENANT_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('rejects an empty patch with a 400', async () => {
      await expect(service.update(42, TENANT_ID, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('refuses to delete the caller own account', async () => {
      await expect(
        service.remove(ADMIN_ID, TENANT_ID, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes a user in the tenant and returns the id', async () => {
      const deleted = await service.remove(42, TENANT_ID, ADMIN_ID);
      expect(deleted).toBe(42);
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    });
  });
});
