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
import { CoachingItemsService } from '../coaching-items/coaching-items.service';
import { CpmProcessService } from '../cpm-process/cpm-process.service';
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

const mockCoachingItems = {
  findOpenItemsForPrompt: vi.fn(),
};

const mockCpm = {
  resolveSourceId: vi.fn(),
  getPromptCatalogue: vi.fn(),
  run: vi.fn(),
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
    mockOpenAIChat.generateReply.mockResolvedValue({ text: 'Great coaching advice!' });
    mockCoachingItems.findOpenItemsForPrompt.mockResolvedValue([]);
    // CPM off by default — preserves the existing (non-CPM) assertions.
    mockCpm.resolveSourceId.mockReturnValue(null);
    mockCpm.getPromptCatalogue.mockResolvedValue(null);
    mockPrisma.chatMessage.create.mockResolvedValue(mockMsg('user', 'hello'));
    mockPrisma.$transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QdrantService, useValue: mockQdrant },
        { provide: EmbeddingService, useValue: mockEmbedding },
        { provide: CoachingItemsService, useValue: mockCoachingItems },
        { provide: CpmProcessService, useValue: mockCpm },
        { provide: OpenAIChatService, useValue: mockOpenAIChat },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ─── ask ────────────────────────────────────────────────────────────────────
  const USER_ID = 42;
  const TENANT_ID = 3;

  describe('ask', () => {
    it('should return a reply and persist both messages in a transaction', async () => {
      const result = await service.ask(USER_ID, TENANT_ID, {
        message: 'How can I improve focus?',
      });

      expect(result).toEqual({ reply: 'Great coaching advice!' });
      expect(mockEmbedding.embedQuery).toHaveBeenCalledWith('How can I improve focus?');
      expect(mockQdrant.searchKnowledge).toHaveBeenCalledTimes(1);
      expect(mockOpenAIChat.generateReply).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('leaves CPM tools disabled when the tenant maps to no source', async () => {
      await service.ask(USER_ID, TENANT_ID, { message: 'hello' });
      const opts = mockOpenAIChat.generateReply.mock.calls[0][2];
      expect(opts.extraTools).toBeUndefined();
      expect(opts.executeTool).toBeUndefined();
    });

    it('wires CPM tools + catalogue when the tenant has a mapped source', async () => {
      mockCpm.resolveSourceId.mockReturnValue(5);
      mockCpm.getPromptCatalogue.mockResolvedValue('EDGE-MAP-CATALOGUE');
      mockCpm.run.mockResolvedValue({ rows: [{ id: 'p1' }] });

      await service.ask(USER_ID, TENANT_ID, { message: 'subprocesses under Einkauf' });

      expect(mockCpm.resolveSourceId).toHaveBeenCalledWith(TENANT_ID);
      const [systemPrompt, , opts] = mockOpenAIChat.generateReply.mock.calls[0];
      expect(systemPrompt).toContain('EDGE-MAP-CATALOGUE');
      expect(systemPrompt).toContain('Process repository (CPM)');
      expect(opts.extraTools).toBeDefined();
      expect(opts.extraTools.length).toBeGreaterThan(0);

      // The executor routes tool calls to the resolved source.
      await opts.executeTool('traverse', { start: {} });
      expect(mockCpm.run).toHaveBeenCalledWith('traverse', { start: {} }, 5);
    });

    it('keeps chat working when the CPM catalogue lookup fails', async () => {
      mockCpm.resolveSourceId.mockReturnValue(5);
      mockCpm.getPromptCatalogue.mockRejectedValue(new Error('cpm down'));

      const res = await service.ask(USER_ID, TENANT_ID, { message: 'hello' });
      expect(res).toEqual({ reply: 'Great coaching advice!' });
      const opts = mockOpenAIChat.generateReply.mock.calls[0][2];
      expect(opts.extraTools).toBeUndefined();
    });

    it('still returns the reply when persisting chat history fails', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('column tenantId does not exist'));
      const res = await service.ask(USER_ID, TENANT_ID, { message: 'hello' });
      expect(res).toEqual({ reply: 'Great coaching advice!' });
    });

    it('should scope retrieval to the caller tenant', async () => {
      await service.ask(USER_ID, TENANT_ID, { message: 'hello' });

      // searchKnowledge(vector, topK, tenantId)
      expect(mockQdrant.searchKnowledge).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Number),
        TENANT_ID,
      );
    });

    it('should persist both messages as belonging to the requesting user + tenant', async () => {
      await service.ask(USER_ID, TENANT_ID, { message: 'hello' });

      // Both create() calls must carry the same userId + tenantId.
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, tenantId: TENANT_ID, role: 'user', content: 'hello' },
      });
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          role: 'assistant',
          content: 'Great coaching advice!',
        },
      });
    });

    it('should load the user\'s open items scoped by userId + tenantId', async () => {
      await service.ask(USER_ID, TENANT_ID, { message: 'hello' });

      expect(mockCoachingItems.findOpenItemsForPrompt).toHaveBeenCalledWith(
        USER_ID,
        TENANT_ID,
      );
    });

    it('should inject open coaching items into the system prompt', async () => {
      mockCoachingItems.findOpenItemsForPrompt.mockResolvedValue([
        {
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
        },
      ]);

      await service.ask(USER_ID, TENANT_ID, { message: 'hello' });

      const systemPrompt = mockOpenAIChat.generateReply.mock.calls[0][0] as string;
      expect(systemPrompt).toContain('Your current coaching items');
      expect(systemPrompt).toContain('Meditate every morning');
      // Items block must come before the knowledge base excerpts.
      expect(systemPrompt.indexOf('Your current coaching items')).toBeLessThan(
        systemPrompt.indexOf('Knowledge base excerpts'),
      );
    });

    it('should not add an items block when the user has no open items', async () => {
      mockCoachingItems.findOpenItemsForPrompt.mockResolvedValue([]);

      await service.ask(USER_ID, TENANT_ID, { message: 'hello' });

      const systemPrompt = mockOpenAIChat.generateReply.mock.calls[0][0] as string;
      expect(systemPrompt).not.toContain('Your current coaching items');
    });

    it('should still reply normally when the AI suggests no item', async () => {
      mockOpenAIChat.generateReply.mockResolvedValue({ text: 'Just a reply.' });

      const result = await service.ask(USER_ID, TENANT_ID, { message: 'hello' });

      expect(result).toEqual({ reply: 'Just a reply.' });
      expect(result).not.toHaveProperty('suggestedItem');
    });

    it('should surface suggestedItem when the AI detects an intention', async () => {
      const suggestedItem = {
        type: 'habit',
        title: 'Meditate 10 minutes every morning',
        dueDate: '2026-07-01',
      };
      mockOpenAIChat.generateReply.mockResolvedValue({
        text: 'Great goal!',
        suggestedItem,
      });

      const result = await service.ask(USER_ID, TENANT_ID, {
        message: 'I want to meditate every morning',
      });

      expect(result).toEqual({ reply: 'Great goal!', suggestedItem });
    });

    it('should NOT persist the suggested item (suggestion only)', async () => {
      mockOpenAIChat.generateReply.mockResolvedValue({
        text: 'Great goal!',
        suggestedItem: { type: 'habit', title: 'Meditate' },
      });

      await service.ask(USER_ID, TENANT_ID, { message: 'I want to meditate' });

      // Only the two chat messages are written — no coaching item create.
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should still reply when loading open items fails (graceful degradation)', async () => {
      mockCoachingItems.findOpenItemsForPrompt.mockRejectedValue(
        new Error('db down'),
      );

      const result = await service.ask(USER_ID, TENANT_ID, { message: 'hello' });

      expect(result).toEqual({ reply: 'Great coaching advice!' });
    });

    it('should trim whitespace from the message before processing', async () => {
      await service.ask(USER_ID, TENANT_ID, { message: '  focus  ' });

      expect(mockEmbedding.embedQuery).toHaveBeenCalledWith('focus');
      // ChatService passes (systemPrompt, userMessage, options) to OpenAIChatService.
      expect(mockOpenAIChat.generateReply).toHaveBeenCalledWith(
        expect.any(String),
        'focus',
        expect.objectContaining({ enableItemSuggestion: true }),
      );
    });

    it('should throw BadRequestException for an empty message', async () => {
      await expect(service.ask(USER_ID, TENANT_ID, { message: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for a whitespace-only message', async () => {
      await expect(service.ask(USER_ID, TENANT_ID, { message: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ServiceUnavailableException when embedding (retrieval) fails', async () => {
      mockEmbedding.embedQuery.mockRejectedValue(new Error('Embedding down'));

      await expect(service.ask(USER_ID, TENANT_ID, { message: 'hello' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException when OpenAI chat generation fails', async () => {
      mockOpenAIChat.generateReply.mockRejectedValue(new Error('OpenAI chat down'));

      await expect(service.ask(USER_ID, TENANT_ID, { message: 'hello' })).rejects.toThrow(
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

      const result = await service.getHistory(USER_ID, TENANT_ID, 1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should only query the requesting user\'s own messages scoped by tenant', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(0);

      await service.getHistory(USER_ID, TENANT_ID, 1, 20);

      // Both the page query and the count must be scoped by userId + tenantId.
      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, tenantId: TENANT_ID } }),
      );
      expect(mockPrisma.chatMessage.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, tenantId: TENANT_ID },
      });
    });

    it('should default to page 1 and limit 20 when called without pagination args', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(0);

      const result = await service.getHistory(USER_ID, TENANT_ID);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('should correctly compute totalPages from total and limit', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.count.mockResolvedValue(45);

      const result = await service.getHistory(USER_ID, TENANT_ID, 2, 10);

      expect(result.totalPages).toBe(5);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it('should isolate history between two users in different tenants', async () => {
      // Each (userId, tenantId) pair only ever sees its own rows.
      const key = (u: number, t: number) => `${u}:${t}`;
      const rows: Record<string, ReturnType<typeof mockMsg>[]> = {
        [key(1, 100)]: [mockMsg('user', 'tenant 100 user 1 secret', 10)],
        [key(2, 200)]: [mockMsg('user', 'tenant 200 user 2 secret', 20)],
      };
      mockPrisma.chatMessage.findMany.mockImplementation(
        ({ where }: { where: { userId: number; tenantId: number } }) =>
          rows[key(where.userId, where.tenantId)] ?? [],
      );
      mockPrisma.chatMessage.count.mockImplementation(
        ({ where }: { where: { userId: number; tenantId: number } }) =>
          (rows[key(where.userId, where.tenantId)] ?? []).length,
      );

      const a = await service.getHistory(1, 100);
      const b = await service.getHistory(2, 200);

      expect(a.items).toEqual(rows[key(1, 100)]);
      expect(b.items).toEqual(rows[key(2, 200)]);
      // Neither tenant/user can see the other's content.
      expect(JSON.stringify(a.items)).not.toContain('tenant 200 user 2 secret');
      expect(JSON.stringify(b.items)).not.toContain('tenant 100 user 1 secret');

      // A user querying with the wrong tenant gets nothing (no cross-tenant leak).
      const crossTenant = await service.getHistory(1, 200);
      expect(crossTenant.items).toEqual([]);
    });
  });
});
