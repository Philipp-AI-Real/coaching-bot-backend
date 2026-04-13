import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { GeminiEmbeddingService } from '../embedding/gemini-embedding.service';
import { GeminiChatService } from '../chat/gemini-chat.service';

// ─── helpers ──────────────────────────────────────────────────────────────────
const mockMsg = (role: 'user' | 'assistant', content: string, id = 1) => ({
  id,
  role,
  content,
  createdAt: new Date('2026-04-13T10:00:00.000Z'),
});

// ─── mocks ────────────────────────────────────────────────────────────────────
const mockPrisma = {
  chatMessage: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
};

const mockQdrant = {
  searchKnowledge: vi.fn(),
};

const mockEmbedding = {
  embedQuery: vi.fn(),
};

const mockGeminiChat = {
  generateCoachReply: vi.fn(),
};

const mockConfig = {
  get: vi.fn().mockImplementation((key: string, defaultVal?: unknown) => {
    const values: Record<string, string> = { RAG_TOP_K: '8' };
    return values[key] ?? defaultVal;
  }),
};

// ─── suite ────────────────────────────────────────────────────────────────────
describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Happy-path defaults
    mockEmbedding.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQdrant.searchKnowledge.mockResolvedValue([
      { score: 0.9, knowledgeBaseId: 1, chunkIndex: 0, text: 'Context about coaching.' },
    ]);
    mockGeminiChat.generateCoachReply.mockResolvedValue('Great coaching advice!');
    mockPrisma.chatMessage.create.mockResolvedValue(mockMsg('user', 'hello'));
    mockPrisma.$transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QdrantService, useValue: mockQdrant },
        { provide: GeminiEmbeddingService, useValue: mockEmbedding },
        { provide: GeminiChatService, useValue: mockGeminiChat },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ─── ask ────────────────────────────────────────────────────────────────────
  describe('ask', () => {
    it('should return a reply and persist both messages in a transaction', async () => {
      const result = await service.ask({ message: 'How can I improve focus?' });

      expect(result).toEqual({ reply: 'Great coaching advice!' });
      expect(mockEmbedding.embedQuery).toHaveBeenCalledWith('How can I improve focus?');
      expect(mockQdrant.searchKnowledge).toHaveBeenCalledTimes(1);
      expect(mockGeminiChat.generateCoachReply).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should trim whitespace from the message before processing', async () => {
      await service.ask({ message: '  focus  ' });

      expect(mockEmbedding.embedQuery).toHaveBeenCalledWith('focus');
      expect(mockGeminiChat.generateCoachReply).toHaveBeenCalledWith(
        expect.objectContaining({ userMessage: 'focus' }),
      );
    });

    it('should throw BadRequestException for an empty message', async () => {
      await expect(service.ask({ message: '' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for a whitespace-only message', async () => {
      await expect(service.ask({ message: '   ' })).rejects.toThrow(BadRequestException);
    });

    it('should throw ServiceUnavailableException when embedding (retrieval) fails', async () => {
      mockEmbedding.embedQuery.mockRejectedValue(new Error('Gemini embedding down'));

      await expect(service.ask({ message: 'hello' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException when Gemini chat generation fails', async () => {
      mockGeminiChat.generateCoachReply.mockRejectedValue(new Error('Gemini chat down'));

      await expect(service.ask({ message: 'hello' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // ─── getHistory ─────────────────────────────────────────────────────────────
  describe('getHistory', () => {
    it('should return paginated history with correct shape', async () => {
      const items = [mockMsg('assistant', 'Hello!', 2), mockMsg('user', 'Hi', 1)];
      mockPrisma.chatMessage.findMany.mockResolvedValue(items);
      mockPrisma.chatMessage.count.mockResolvedValue(2);

      const result = await service.getHistory(1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should default to page 1 and limit 20 when called without arguments', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(0);

      const result = await service.getHistory();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('should correctly compute totalPages from total and limit', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(45);

      const result = await service.getHistory(2, 10);

      expect(result.totalPages).toBe(5);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });
});
