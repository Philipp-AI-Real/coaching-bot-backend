import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QdrantService } from '../qdrant/qdrant.service';

// Mock @qdrant/js-client-rest — capture QdrantClient calls.
const mockGetCollections = vi.fn();
const mockGetCollection = vi.fn();
const mockCreateCollection = vi.fn();
const mockDeleteCollection = vi.fn();
const mockSearch = vi.fn();
const mockDelete = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class MockQdrantClient {
    getCollections = mockGetCollections;
    getCollection = mockGetCollection;
    createCollection = mockCreateCollection;
    deleteCollection = mockDeleteCollection;
    search = mockSearch;
    delete = mockDelete;
  },
}));

const makeConfig = (overrides: Record<string, string> = {}) => ({
  get: vi.fn().mockImplementation((key: string, defaultVal?: unknown) => {
    const values: Record<string, string> = {
      QDRANT_HOST: 'localhost',
      QDRANT_PORT: '6333',
      QDRANT_USE_TLS: 'false',
      QDRANT_COLLECTION: 'test_collection',
      QDRANT_VECTOR_SIZE: '1536',
      ...overrides,
    };
    return values[key] ?? defaultVal;
  }),
});

const buildService = async (
  configOverrides: Record<string, string> = {},
): Promise<QdrantService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QdrantService,
      { provide: ConfigService, useValue: makeConfig(configOverrides) },
    ],
  }).compile();
  return module.get<QdrantService>(QdrantService);
};

describe('QdrantService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onModuleInit — collection creation', () => {
    it('should create a new collection with 1536 dims if it does not exist', async () => {
      mockGetCollections.mockResolvedValueOnce({ collections: [] });

      const service = await buildService();
      await service.onModuleInit();

      expect(mockCreateCollection).toHaveBeenCalledTimes(1);
      expect(mockCreateCollection).toHaveBeenCalledWith('test_collection', {
        vectors: { size: 1536, distance: 'Cosine' },
      });
      expect(mockDeleteCollection).not.toHaveBeenCalled();
    });

    it('should honor QDRANT_VECTOR_SIZE from env (e.g. 768)', async () => {
      mockGetCollections.mockResolvedValueOnce({ collections: [] });

      const service = await buildService({ QDRANT_VECTOR_SIZE: '768' });
      await service.onModuleInit();

      expect(mockCreateCollection).toHaveBeenCalledWith('test_collection', {
        vectors: { size: 768, distance: 'Cosine' },
      });
    });

    it('should leave the collection alone if dims already match', async () => {
      mockGetCollections.mockResolvedValueOnce({
        collections: [{ name: 'test_collection' }],
      });
      mockGetCollection.mockResolvedValueOnce({
        config: { params: { vectors: { size: 1536, distance: 'Cosine' } } },
      });

      const service = await buildService();
      await service.onModuleInit();

      expect(mockCreateCollection).not.toHaveBeenCalled();
      expect(mockDeleteCollection).not.toHaveBeenCalled();
    });

    it('should delete and recreate the collection when dims differ (768 → 1536)', async () => {
      mockGetCollections.mockResolvedValueOnce({
        collections: [{ name: 'test_collection' }],
      });
      mockGetCollection.mockResolvedValueOnce({
        config: { params: { vectors: { size: 768, distance: 'Cosine' } } },
      });

      const service = await buildService();
      await service.onModuleInit();

      expect(mockDeleteCollection).toHaveBeenCalledWith('test_collection');
      expect(mockCreateCollection).toHaveBeenCalledWith('test_collection', {
        vectors: { size: 1536, distance: 'Cosine' },
      });
    });
  });

  describe('expectedVectorSize', () => {
    it('should expose the configured vector size', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      const service = await buildService();
      expect(service.expectedVectorSize).toBe(1536);
    });
  });

  describe('searchKnowledge — tenant scoping', () => {
    it('should send a tenantId filter so only the tenant\'s vectors are searched', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      mockSearch.mockResolvedValueOnce([
        {
          score: 0.9,
          payload: { tenantId: 7, knowledgeBaseId: 1, chunkIndex: 0, text: 'hi' },
        },
      ]);
      const service = await buildService();

      const result = await service.searchKnowledge([0.1, 0.2], 5, 7);

      expect(mockSearch).toHaveBeenCalledWith('test_collection', {
        vector: [0.1, 0.2],
        limit: 5,
        with_payload: true,
        filter: { must: [{ key: 'tenantId', match: { value: 7 } }] },
      });
      expect(result[0]).toMatchObject({ knowledgeBaseId: 1, chunkIndex: 0, text: 'hi' });
    });
  });

  describe('deleteByKnowledgeBaseId — tenant scoping', () => {
    it('should filter the delete by both tenantId and knowledgeBaseId', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      mockDelete.mockResolvedValueOnce(undefined);
      const service = await buildService();

      await service.deleteByKnowledgeBaseId(3, 7);

      expect(mockDelete).toHaveBeenCalledWith('test_collection', {
        filter: {
          must: [
            { key: 'tenantId', match: { value: 7 } },
            { key: 'knowledgeBaseId', match: { value: 3 } },
          ],
        },
      });
    });
  });
});
