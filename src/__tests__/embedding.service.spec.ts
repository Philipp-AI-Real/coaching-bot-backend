import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../embedding/embedding.service';

// Mock the openai module — capture the constructor and the embeddings.create method.
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class MockOpenAI {
    embeddings = { create: mockCreate };
  },
}));

const makeVector = (dim: number): number[] =>
  Array.from({ length: dim }, (_, i) => i / dim);

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  const mockConfig = {
    get: vi.fn().mockImplementation((key: string, defaultVal?: unknown) => {
      const values: Record<string, string> = {
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
      };
      return values[key] ?? defaultVal;
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  describe('embedText', () => {
    it('should return a 1536-dim vector from OpenAI', async () => {
      const vec = makeVector(1536);
      mockCreate.mockResolvedValueOnce({ data: [{ embedding: vec }] });

      const result = await service.embedText('hello world');

      expect(result).toHaveLength(1536);
      expect(result).toEqual(vec);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'hello world',
      });
    });

    it('should trim whitespace from input before embedding', async () => {
      mockCreate.mockResolvedValueOnce({
        data: [{ embedding: makeVector(1536) }],
      });

      await service.embedText('  focus  ');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ input: 'focus' }),
      );
    });

    it('should throw when text is empty or whitespace-only', async () => {
      await expect(service.embedText('')).rejects.toThrow(
        'Cannot embed empty text',
      );
      await expect(service.embedText('   ')).rejects.toThrow(
        'Cannot embed empty text',
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should throw when OpenAI returns no embedding values', async () => {
      mockCreate.mockResolvedValueOnce({ data: [{ embedding: [] }] });

      await expect(service.embedText('hello')).rejects.toThrow(
        'OpenAI embedding response missing values',
      );
    });
  });

  describe('embedQuery', () => {
    it('should delegate to embedText (bidirectional embeddings)', async () => {
      const vec = makeVector(1536);
      mockCreate.mockResolvedValueOnce({ data: [{ embedding: vec }] });

      const result = await service.embedQuery('what is coaching?');

      expect(result).toEqual(vec);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'what is coaching?',
      });
    });
  });

  describe('embedTexts', () => {
    it('should return a 1536-dim vector for each input text', async () => {
      const inputs = ['chunk 1', 'chunk 2', 'chunk 3'];
      mockCreate.mockResolvedValueOnce({
        data: inputs.map(() => ({ embedding: makeVector(1536) })),
      });

      const result = await service.embedTexts(inputs);

      expect(result).toHaveLength(3);
      result.forEach((v) => expect(v).toHaveLength(1536));
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: inputs,
      });
    });

    it('should throw if the response count does not match the input count', async () => {
      mockCreate.mockResolvedValueOnce({
        data: [{ embedding: makeVector(1536) }],
      });

      await expect(service.embedTexts(['a', 'b'])).rejects.toThrow(
        'OpenAI batch embedding response incomplete',
      );
    });
  });

  describe('vectorSize', () => {
    it('should expose the expected embedding dimension (1536)', () => {
      expect(service.vectorSize).toBe(1536);
    });
  });
});
