import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { GeminiEmbeddingService } from '../embedding/gemini-embedding.service';
import { GeminiChatService } from './gemini-chat.service';
import { AskChatDto } from './dto/ask-chat.dto';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
    private readonly embedding: GeminiEmbeddingService,
    private readonly geminiChat: GeminiChatService,
    private readonly config: ConfigService,
  ) {}

  async ask(dto: AskChatDto) {
    const message = dto.message?.trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    const topK = Number(this.config.get('RAG_TOP_K', 8));

    let hits: Awaited<ReturnType<QdrantService['searchKnowledge']>>;
    try {
      const vector = await this.embedding.embedQuery(message);
      hits = await this.qdrant.searchKnowledge(vector, topK);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      throw new ServiceUnavailableException(
        `Retrieval failed: ${err}`,
      );
    }

    const seen = new Set<string>();
    const contextChunks: string[] = [];
    for (const h of hits) {
      if (!h.text?.trim()) continue;
      const key = `${h.knowledgeBaseId}:${h.chunkIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contextChunks.push(h.text);
    }

    let reply: string;
    try {
      reply = await this.geminiChat.generateCoachReply({
        userMessage: message,
        contextChunks,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      throw new ServiceUnavailableException(`Coach reply failed: ${err}`);
    }

    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { role: 'user', content: message },
      }),
      this.prisma.chatMessage.create({
        data: { role: 'assistant', content: reply },
      }),
    ]);

    return {
      reply,
    };
  }

  async getHistory(page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      }),
      this.prisma.chatMessage.count(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
    };
  }
}
