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
import { EmbeddingService } from '../embedding/embedding.service';
import { OpenAIChatService } from '../chat/openai-chat.service';

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

const mockOpenAIChat = {
  generateReply: vi.fn(),
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
    mockOpenAIChat.generateReply.mockResolvedValue('Great coaching advice!');
    mockPrisma.chatMessage.create.mockResolvedValue(mockMsg('user', 'hello'));
    mockPrisma.$transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QdrantService, useValue: mockQdrant },
        { provide: EmbeddingService, useValue: mockEmbedding },
        { provide: OpenAIChatService, useValue: mockOpenAIChat },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ─── ask ────────────────────────────────────────────────────────────────────
  const USER_ID = 42;

  describe('ask', () => {
    it('should return a reply and persist both messages in a transaction', async () => {
      const result = await service.ask(USER_ID, { message: 'How can I improve focus?' });

      expect(result).toEqual({ reply: 'Great coaching advice!' });
      expect(mockEmbedding.embedQuery).toHaveBeenCalledWith('How can I improve focus?');
      expect(mockQdrant.searchKnowledge).toHaveBeenCalledTimes(1);
      expect(mockOpenAIChat.generateReply).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should persist both messages as belonging to the requesting user', async () => {
      await service.ask(USER_ID, { message: 'hello' });

      // Both create() calls must carry the same userId (owner of the messages).
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, role: 'user', content: 'hello' },
      });
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, role: 'assistant', content: 'Great coaching advice!' },
      });
    });

    it('should trim whitespace from the message before processing', async () => {
      await service.ask(USER_ID, { message: '  focus  ' });

      expect(mockEmbedding.embedQuery).toHaveBeenCalledWith('focus');
      // ChatService now passes (systemPrompt, userMessage) to OpenAIChatService.
      expect(mockOpenAIChat.generateReply).toHaveBeenCalledWith(
        expect.any(String),
        'focus',
      );
    });

    it('should throw BadRequestException for an empty message', async () => {
      await expect(service.ask(USER_ID, { message: '' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for a whitespace-only message', async () => {
      await expect(service.ask(USER_ID, { message: '   ' })).rejects.toThrow(BadRequestException);
    });

    it('should throw ServiceUnavailableException when embedding (retrieval) fails', async () => {
      mockEmbedding.embedQuery.mockRejectedValue(new Error('Gemini embedding down'));

      await expect(service.ask(USER_ID, { message: 'hello' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException when OpenAI chat generation fails', async () => {
      mockOpenAIChat.generateReply.mockRejectedValue(new Error('OpenAI chat down'));

      await expect(service.ask(USER_ID, { message: 'hello' })).rejects.toThrow(
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

      const result = await service.getHistory(USER_ID, 1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should only query the requesting user\'s own messages', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(0);

      await service.getHistory(USER_ID, 1, 20);

      // Both the page query and the count must be scoped by userId.
      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
      expect(mockPrisma.chatMessage.count).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it('should default to page 1 and limit 20 when called without pagination args', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(0);

      const result = await service.getHistory(USER_ID);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('should correctly compute totalPages from total and limit', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(45);

      const result = await service.getHistory(USER_ID, 2, 10);

      expect(result.totalPages).toBe(5);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it('should isolate history between two different users', async () => {
      // Simulate a store where each user only ever sees their own rows.
      const rowsByUser: Record<number, ReturnType<typeof mockMsg>[]> = {
        1: [mockMsg('user', 'user 1 secret', 10)],
        2: [mockMsg('user', 'user 2 secret', 20)],
      };
      mockPrisma.chatMessage.findMany.mockImplementation(
        ({ where }: { where: { userId: number } }) => rowsByUser[where.userId] ?? [],
      );
      mockPrisma.chatMessage.count.mockImplementation(
        ({ where }: { where: { userId: number } }) =>
          (rowsByUser[where.userId] ?? []).length,
      );

      const user1History = await service.getHistory(1);
      const user2History = await service.getHistory(2);

      expect(user1History.items).toEqual(rowsByUser[1]);
      expect(user2History.items).toEqual(rowsByUser[2]);
      // Neither user can see the other's message content.
      expect(JSON.stringify(user1History.items)).not.toContain('user 2 secret');
      expect(JSON.stringify(user2History.items)).not.toContain('user 1 secret');
    });
  });
});
