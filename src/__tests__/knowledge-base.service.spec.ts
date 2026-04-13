import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { GeminiEmbeddingService } from '../embedding/gemini-embedding.service';

// ─── fs mock ──────────────────────────────────────────────────────────────────
// Preserve the real fs module (Prisma uses fs.existsSync at import time)
// and only stub the three async methods the service calls.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Suppress pdf-parse import side-effects in the test environment
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'parsed pdf content' }),
}));

// ─── helpers ──────────────────────────────────────────────────────────────────
const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'test.txt',
  encoding: '7bit',
  mimetype: 'text/plain',
  size: 64,
  buffer: Buffer.from('This is test coaching content used to verify chunking and storage.'),
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

const makeDoc = (overrides = {}) => ({
  id: 1,
  title: 'Test Doc',
  originalFilename: 'test.txt',
  mimeType: 'text/plain',
  relativePath: 'storage/knowledge-base/uuid-test.txt',
  chunkCount: 0,
  createdAt: new Date('2026-04-13T10:00:00.000Z'),
  updatedAt: new Date('2026-04-13T10:00:01.000Z'),
  ...overrides,
});

// ─── mocks ────────────────────────────────────────────────────────────────────
const mockPrisma = {
  knowledgeBaseDocument: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const mockQdrant = {
  client: {
    upsert: vi.fn().mockResolvedValue(undefined),
  },
  collectionName: 'test_collection',
  deleteByKnowledgeBaseId: vi.fn().mockResolvedValue(undefined),
};

const mockEmbedding = {
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
};

const mockConfig = {
  get: vi.fn().mockImplementation((key: string, defaultVal?: unknown) => {
    const values: Record<string, string> = {
      CHUNK_SIZE: '800',
      CHUNK_OVERLAP: '100',
      FILES_PUBLIC_BASE_URL: 'http://localhost:3000',
    };
    return values[key] ?? defaultVal;
  }),
};

// ─── suite ────────────────────────────────────────────────────────────────────
describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Restore happy-path defaults after clearAllMocks
    mockPrisma.knowledgeBaseDocument.create.mockResolvedValue(makeDoc());
    mockPrisma.knowledgeBaseDocument.update.mockResolvedValue(makeDoc({ chunkCount: 1 }));
    mockPrisma.knowledgeBaseDocument.delete.mockResolvedValue(undefined);
    mockEmbedding.embedTexts.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockQdrant.client.upsert.mockResolvedValue(undefined);
    mockQdrant.deleteByKnowledgeBaseId.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QdrantService, useValue: mockQdrant },
        { provide: GeminiEmbeddingService, useValue: mockEmbedding },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  // ─── createFromUpload ───────────────────────────────────────────────────────
  describe('createFromUpload', () => {
    it('should upload a .txt file, persist metadata, and return the response DTO', async () => {
      const result = await service.createFromUpload(makeFile(), 'Test Doc');

      expect(mockPrisma.knowledgeBaseDocument.create).toHaveBeenCalledTimes(1);
      expect(mockEmbedding.embedTexts).toHaveBeenCalledTimes(1);
      expect(mockQdrant.client.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.knowledgeBaseDocument.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { chunkCount: 1 },
      });
      expect(result.id).toBe(1);
      expect(result.chunkCount).toBe(1);
      expect(result.fileUrl).toBe(
        'http://localhost:3000/storage/knowledge-base/uuid-test.txt',
      );
    });

    it('should throw BadRequestException when no file is provided', async () => {
      await expect(service.createFromUpload(undefined, 'title')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for an unsupported file extension', async () => {
      await expect(
        service.createFromUpload(
          makeFile({ originalname: 'document.docx', buffer: Buffer.from('data') }),
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when extracted text is empty (whitespace only)', async () => {
      await expect(
        service.createFromUpload(makeFile({ buffer: Buffer.from('   \n\n  ') }), undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should clean up the DB record and file when Qdrant ingest fails', async () => {
      mockEmbedding.embedTexts.mockRejectedValue(new Error('Embedding service down'));

      await expect(service.createFromUpload(makeFile(), undefined)).rejects.toThrow(
        'Embedding service down',
      );

      expect(mockPrisma.knowledgeBaseDocument.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return an array of response DTOs ordered by id desc', async () => {
      const rows = [makeDoc({ id: 2 }), makeDoc({ id: 1 })];
      mockPrisma.knowledgeBaseDocument.findMany.mockResolvedValue(rows);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });

    it('should return an empty array when no documents exist', async () => {
      mockPrisma.knowledgeBaseDocument.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return the response DTO for an existing document', async () => {
      mockPrisma.knowledgeBaseDocument.findUnique.mockResolvedValue(makeDoc({ id: 5 }));

      const result = await service.findOne(5);

      expect(result.id).toBe(5);
      expect(mockPrisma.knowledgeBaseDocument.findUnique).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });

    it('should throw NotFoundException when the document does not exist', async () => {
      mockPrisma.knowledgeBaseDocument.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('should delete Qdrant vectors, local file, and DB record', async () => {
      mockPrisma.knowledgeBaseDocument.findUnique.mockResolvedValue(makeDoc({ id: 3 }));

      await service.remove(3);

      expect(mockQdrant.deleteByKnowledgeBaseId).toHaveBeenCalledWith(3);
      expect(mockPrisma.knowledgeBaseDocument.delete).toHaveBeenCalledWith({
        where: { id: 3 },
      });
    });

    it('should throw NotFoundException when the document does not exist', async () => {
      mockPrisma.knowledgeBaseDocument.findUnique.mockResolvedValue(null);

      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});
