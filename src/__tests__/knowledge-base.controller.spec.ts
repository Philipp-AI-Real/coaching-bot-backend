import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KnowledgeBaseController } from '../knowledge-base/knowledge-base.controller';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';

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
  createFromUpload: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
};

// ─── suite ────────────────────────────────────────────────────────────────────
describe('KnowledgeBaseController', () => {
  let controller: KnowledgeBaseController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [{ provide: KnowledgeBaseService, useValue: mockKbService }],
    }).compile();

    controller = module.get<KnowledgeBaseController>(KnowledgeBaseController);
  });

  // ─── create ─────────────────────────────────────────────────────────────────
  describe('create (POST /knowledge-base)', () => {
    it('should delegate to service and return the created document DTO', async () => {
      const dto = makeDto();
      mockKbService.createFromUpload.mockResolvedValue(dto);
      const file = makeFile();

      const result = await controller.create(file, 'Test Doc');

      expect(result).toEqual(dto);
      expect(mockKbService.createFromUpload).toHaveBeenCalledWith(file, 'Test Doc');
    });

    it('should propagate BadRequestException when service rejects (no file)', async () => {
      mockKbService.createFromUpload.mockRejectedValue(
        new BadRequestException('File is required'),
      );

      await expect(controller.create(undefined as any, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should propagate BadRequestException for unsupported file type', async () => {
      mockKbService.createFromUpload.mockRejectedValue(
        new BadRequestException('Unsupported file extension'),
      );
      const badFile = makeFile();
      (badFile as any).originalname = 'report.docx';

      await expect(controller.create(badFile, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────
  describe('findAll (GET /knowledge-base)', () => {
    it('should delegate to service and return the document array', async () => {
      const docs = [makeDto(2), makeDto(1)];
      mockKbService.findAll.mockResolvedValue(docs);

      const result = await controller.findAll();

      expect(result).toEqual(docs);
      expect(mockKbService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when no documents exist', async () => {
      mockKbService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────
  describe('findOne (GET /knowledge-base/:id)', () => {
    it('should delegate to service and return the single document DTO', async () => {
      const dto = makeDto(7);
      mockKbService.findOne.mockResolvedValue(dto);

      const result = await controller.findOne(7);

      expect(result).toEqual(dto);
      expect(mockKbService.findOne).toHaveBeenCalledWith(7);
    });

    it('should propagate NotFoundException when document does not exist', async () => {
      mockKbService.findOne.mockRejectedValue(
        new NotFoundException('Knowledge base 99 not found'),
      );

      await expect(controller.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────
  describe('remove (DELETE /knowledge-base/:id)', () => {
    it('should call service.remove and return { deletedId }', async () => {
      mockKbService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(3);

      expect(result).toEqual({ deletedId: 3 });
      expect(mockKbService.remove).toHaveBeenCalledWith(3);
    });

    it('should propagate NotFoundException when document does not exist', async () => {
      mockKbService.remove.mockRejectedValue(
        new NotFoundException('Knowledge base 99 not found'),
      );

      await expect(controller.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});
