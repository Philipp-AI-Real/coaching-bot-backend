import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CoachingItemsService } from '../coaching-items/coaching-items.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── helpers ──────────────────────────────────────────────────────────────────
const USER_ID = 42;
const TENANT_ID = 3;

const makeItem = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  tenantId: TENANT_ID,
  userId: USER_ID,
  type: 'habit',
  title: 'Meditate every morning',
  description: null,
  status: 'open',
  dueDate: null,
  completedAt: null,
  metadata: {},
  createdBy: 'user',
  createdAt: new Date('2026-06-28T08:00:00.000Z'),
  updatedAt: new Date('2026-06-28T08:00:00.000Z'),
  ...over,
});

// ─── mocks ────────────────────────────────────────────────────────────────────
const mockPrisma = {
  coachingItem: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

// ─── suite ────────────────────────────────────────────────────────────────────
describe('CoachingItemsService', () => {
  let service: CoachingItemsService;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPrisma.coachingItem.create.mockResolvedValue(makeItem());
    mockPrisma.coachingItem.findMany.mockResolvedValue([]);
    mockPrisma.coachingItem.findFirst.mockResolvedValue(makeItem());
    mockPrisma.coachingItem.update.mockResolvedValue(makeItem());
    mockPrisma.coachingItem.delete.mockResolvedValue(makeItem());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoachingItemsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CoachingItemsService>(CoachingItemsService);
  });

  // ─── create ───────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create with the owner ids and default status/createdBy', async () => {
      await service.create(USER_ID, TENANT_ID, {
        type: 'habit',
        title: 'Meditate every morning',
      });

      expect(mockPrisma.coachingItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          tenantId: TENANT_ID,
          type: 'habit',
          title: 'Meditate every morning',
          status: 'open',
          createdBy: 'user',
          completedAt: null,
          dueDate: null,
        }),
      });
    });

    it('should stamp completedAt when created already completed', async () => {
      mockPrisma.coachingItem.create.mockResolvedValue(
        makeItem({ status: 'completed', completedAt: new Date() }),
      );

      await service.create(USER_ID, TENANT_ID, {
        type: 'milestone',
        title: 'Done already',
        status: 'completed',
      });

      const data = mockPrisma.coachingItem.create.mock.calls[0][0].data;
      expect(data.status).toBe('completed');
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('should map dueDate string to a Date and return ISO strings', async () => {
      mockPrisma.coachingItem.create.mockResolvedValue(
        makeItem({ dueDate: new Date('2026-07-01T00:00:00.000Z') }),
      );

      const result = await service.create(USER_ID, TENANT_ID, {
        type: 'homework',
        title: 'Read chapter 3',
        dueDate: '2026-07-01',
      });

      const data = mockPrisma.coachingItem.create.mock.calls[0][0].data;
      expect(data.dueDate).toBeInstanceOf(Date);
      expect(result.dueDate).toBe('2026-07-01T00:00:00.000Z');
      expect(typeof result.createdAt).toBe('string');
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should scope the query to the requesting user + tenant', async () => {
      mockPrisma.coachingItem.findMany.mockResolvedValue([
        makeItem({ id: 2 }),
        makeItem({ id: 1 }),
      ]);

      const result = await service.findAll(USER_ID, TENANT_ID);

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(mockPrisma.coachingItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, tenantId: TENANT_ID },
        }),
      );
    });

    it('should pass status and type filters through to the query', async () => {
      await service.findAll(USER_ID, TENANT_ID, { status: 'open', type: 'habit' });

      expect(mockPrisma.coachingItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER_ID,
            tenantId: TENANT_ID,
            status: 'open',
            type: 'habit',
          },
        }),
      );
    });
  });

  // ─── findOne (isolation) ────────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return the item when owned by the requesting user', async () => {
      const result = await service.findOne(1, USER_ID, TENANT_ID);
      expect(result.id).toBe(1);
      expect(mockPrisma.coachingItem.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: USER_ID, tenantId: TENANT_ID },
      });
    });

    it('should throw 404 for an item owned by another user', async () => {
      // Item exists but not for this (userId, tenantId) → findFirst returns null.
      mockPrisma.coachingItem.findFirst.mockResolvedValue(null);

      await expect(service.findOne(5, 999, TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.coachingItem.findFirst).toHaveBeenCalledWith({
        where: { id: 5, userId: 999, tenantId: TENANT_ID },
      });
    });

    it('should throw 404 for an item in another tenant', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(null);

      await expect(service.findOne(5, USER_ID, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.coachingItem.findFirst).toHaveBeenCalledWith({
        where: { id: 5, userId: USER_ID, tenantId: 999 },
      });
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('should throw 404 when updating an item owned by another user', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(null);

      await expect(
        service.update(5, 999, TENANT_ID, { title: 'hack' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.coachingItem.update).not.toHaveBeenCalled();
    });

    it('should set completedAt when status transitions to completed', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(
        makeItem({ status: 'open' }),
      );
      mockPrisma.coachingItem.update.mockResolvedValue(
        makeItem({ status: 'completed', completedAt: new Date() }),
      );

      await service.update(1, USER_ID, TENANT_ID, { status: 'completed' });

      const data = mockPrisma.coachingItem.update.mock.calls[0][0].data;
      expect(data.status).toBe('completed');
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('should clear completedAt when moving away from completed', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(
        makeItem({ status: 'completed', completedAt: new Date() }),
      );
      mockPrisma.coachingItem.update.mockResolvedValue(
        makeItem({ status: 'open', completedAt: null }),
      );

      await service.update(1, USER_ID, TENANT_ID, { status: 'open' });

      const data = mockPrisma.coachingItem.update.mock.calls[0][0].data;
      expect(data.status).toBe('open');
      expect(data.completedAt).toBeNull();
    });

    it('should not touch completedAt when status is unchanged', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(
        makeItem({ status: 'open' }),
      );

      await service.update(1, USER_ID, TENANT_ID, { title: 'New title' });

      const data = mockPrisma.coachingItem.update.mock.calls[0][0].data;
      expect(data.title).toBe('New title');
      expect(data).not.toHaveProperty('completedAt');
      expect(data).not.toHaveProperty('status');
    });

    it('should clear dueDate when passed null', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(makeItem());

      await service.update(1, USER_ID, TENANT_ID, { dueDate: null });

      const data = mockPrisma.coachingItem.update.mock.calls[0][0].data;
      expect(data.dueDate).toBeNull();
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('should throw 404 when removing an item owned by another user', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(null);

      await expect(service.remove(5, 999, TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.coachingItem.delete).not.toHaveBeenCalled();
    });

    it('should delete the item when owned by the requesting user', async () => {
      mockPrisma.coachingItem.findFirst.mockResolvedValue(makeItem());

      await service.remove(1, USER_ID, TENANT_ID);

      expect(mockPrisma.coachingItem.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  // ─── findOpenItemsForPrompt ──────────────────────────────────────────────────
  describe('findOpenItemsForPrompt', () => {
    it('should query active statuses scoped by user + tenant, ordered by due date', async () => {
      mockPrisma.coachingItem.findMany.mockResolvedValue([makeItem()]);

      await service.findOpenItemsForPrompt(USER_ID, TENANT_ID);

      expect(mockPrisma.coachingItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER_ID,
            tenantId: TENANT_ID,
            status: { in: ['open', 'in_progress'] },
          },
          take: 10,
        }),
      );
    });
  });
});
