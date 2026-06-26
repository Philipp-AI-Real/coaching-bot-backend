import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KnowledgeBaseController } from '../knowledge-base/knowledge-base.controller';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

const currentUser: AuthenticatedUser = {
  id: 7,
  username: 'coach',
  role: 'tenant_admin',
  tenantId: 1,
};

// ─── helpers ──────────────────────────────────────────────────────────────────
const makeFile = (): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'test.txt',
  encoding: '7bit',
  mimetype: 'text/plain',
  size: 64,
  buffer: Buffer.from('test content'),
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
});

const makeDto = (id = 1, chunkCount = 1) => ({
  id,
  title: 'Test Doc',
  originalFilename: 'test.txt',
  mimeType: 'text/plain',
  relativePath: 'storage/knowledge-base/uuid-test.txt',
  fileUrl: 'http://localhost:3000/storage/knowledge-base/uuid-test.txt',
  chunkCount,
  createdAt: new Date('2026-04-13T10:00:00.000Z'),
  updatedAt: new Date('2026-04-13T10:00:01.000Z'),
});

// ─── mock service ─────────────────────────────────────────────────────────────
const mockKbService = {
  createFromUpload: vi.fn(),
  createFromUploadBatch: vi.fn(),
  findAll: vi.fn(),
  findOne: vi.fn(),
  remove: vi.fn(),
};

// ─── suite ────────────────────────────────────────────────────────────────────
describe('KnowledgeBaseController', () => {
  let controller: KnowledgeBaseController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [{ provide: KnowledgeBaseService, useValue: mockKbService }],
    }).compile();

    controller = module.get<KnowledgeBaseController>(KnowledgeBaseController);
  });

  // ─── create ─────────────────────────────────────────────────────────────────
  describe('create (POST /knowledge-base)', () => {
    it('should delegate to service with the current tenantId and return the created DTO', async () => {
      const dto = makeDto();
      mockKbService.createFromUpload.mockResolvedValue(dto);
      const file = makeFile();

      const result = await controller.create(currentUser, file, 'Test Doc');

      expect(result).toEqual(dto);
      expect(mockKbService.createFromUpload).toHaveBeenCalledWith(
        file,
        currentUser.tenantId,
        'Test Doc',
      );
    });

    it('should propagate BadRequestException when no file is provided', async () => {
      mockKbService.createFromUpload.mockRejectedValue(
        new BadRequestException('File is required'),
      );

      await expect(
        controller.create(currentUser, undefined as any, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate BadRequestException for unsupported file type', async () => {
      mockKbService.createFromUpload.mockRejectedValue(
        new BadRequestException('Unsupported file extension'),
      );

      await expect(
        controller.create(currentUser, makeFile(), undefined),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── createBatch ──────────────────────────────────────────────────────────────
  describe('createBatch (POST /knowledge-base/batch)', () => {
    it('should delegate to service with the current tenantId', async () => {
      const batchResult = { uploaded: [], failed: [], total: 0, succeeded: 0, failed_count: 0 };
      mockKbService.createFromUploadBatch.mockResolvedValue(batchResult);
      const files = [makeFile()];

      const result = await controller.createBatch(currentUser, files);

      expect(result).toEqual(batchResult);
      expect(mockKbService.createFromUploadBatch).toHaveBeenCalledWith(
        files,
        currentUser.tenantId,
      );
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────
  describe('findAll (GET /knowledge-base)', () => {
    it('should delegate to service with the current tenantId and return the document array', async () => {
      const docs = [makeDto(2), makeDto(1)];
      mockKbService.findAll.mockResolvedValue(docs);

      const result = await controller.findAll(currentUser);

      expect(result).toEqual(docs);
      expect(mockKbService.findAll).toHaveBeenCalledWith(currentUser.tenantId);
    });

    it('should return an empty array when no documents exist', async () => {
      mockKbService.findAll.mockResolvedValue([]);

      expect(await controller.findAll(currentUser)).toEqual([]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────
  describe('findOne (GET /knowledge-base/:id)', () => {
    it('should delegate to service with id and the current tenantId', async () => {
      const dto = makeDto(7);
      mockKbService.findOne.mockResolvedValue(dto);

      const result = await controller.findOne(currentUser, 7);

      expect(result).toEqual(dto);
      expect(mockKbService.findOne).toHaveBeenCalledWith(7, currentUser.tenantId);
    });

    it('should propagate NotFoundException when document does not exist', async () => {
      mockKbService.findOne.mockRejectedValue(
        new NotFoundException('Knowledge base 99 not found'),
      );

      await expect(controller.findOne(currentUser, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────
  describe('remove (DELETE /knowledge-base/:id)', () => {
    it('should call service.remove with id and tenantId and return { deletedId }', async () => {
      mockKbService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(currentUser, 3);

      expect(result).toEqual({ deletedId: 3 });
      expect(mockKbService.remove).toHaveBeenCalledWith(3, currentUser.tenantId);
    });

    it('should propagate NotFoundException when document does not exist', async () => {
      mockKbService.remove.mockRejectedValue(
        new NotFoundException('Knowledge base 99 not found'),
      );

      await expect(controller.remove(currentUser, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
