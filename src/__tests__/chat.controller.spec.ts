import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ChatController } from '../chat/chat.controller';
import { ChatService } from '../chat/chat.service';
import { AskChatDto } from '../chat/dto/ask-chat.dto';
import { ChatHistoryQueryDto } from '../chat/dto/chat-history-query.dto';

// ─── mock service ─────────────────────────────────────────────────────────────
const mockChatService = {
  ask: jest.fn(),
  getHistory: jest.fn(),
};

// ─── suite ────────────────────────────────────────────────────────────────────
describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  // ─── ask ────────────────────────────────────────────────────────────────────
  describe('ask (POST /chat/ask)', () => {
    it('should delegate to service and return the reply', async () => {
      const dto: AskChatDto = { message: 'How can I stay motivated?' };
      mockChatService.ask.mockResolvedValue({ reply: 'Stay consistent!' });

      const result = await controller.ask(dto);

      expect(result).toEqual({ reply: 'Stay consistent!' });
      expect(mockChatService.ask).toHaveBeenCalledWith(dto);
    });

    it('should propagate BadRequestException for an empty message', async () => {
      const dto: AskChatDto = { message: '' };
      mockChatService.ask.mockRejectedValue(new BadRequestException('Message is required'));

      await expect(controller.ask(dto)).rejects.toThrow(BadRequestException);
    });

    it('should propagate ServiceUnavailableException when RAG pipeline fails', async () => {
      const dto: AskChatDto = { message: 'hello' };
      mockChatService.ask.mockRejectedValue(
        new ServiceUnavailableException('Retrieval failed'),
      );

      await expect(controller.ask(dto)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ─── history ────────────────────────────────────────────────────────────────
  describe('history (GET /chat/history)', () => {
    const historyResponse = {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    it('should delegate to service with page and limit from query', async () => {
      mockChatService.getHistory.mockResolvedValue(historyResponse);
      const query = { page: 2, limit: 10 } as ChatHistoryQueryDto;

      const result = await controller.history(query);

      expect(result).toEqual(historyResponse);
      expect(mockChatService.getHistory).toHaveBeenCalledWith(2, 10);
    });

    it('should pass undefined page/limit when query has no values (service defaults apply)', async () => {
      mockChatService.getHistory.mockResolvedValue(historyResponse);
      const query = {} as ChatHistoryQueryDto;

      await controller.history(query);

      expect(mockChatService.getHistory).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should return paginated history shape from service', async () => {
      const response = {
        items: [{ id: 1, role: 'user', content: 'hi', createdAt: new Date() }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      mockChatService.getHistory.mockResolvedValue(response);

      const result = await controller.history({ page: 1, limit: 20 } as ChatHistoryQueryDto);

      expect(result.items).toHaveLength(1);
      expect(result.totalPages).toBe(1);
    });
  });
});
