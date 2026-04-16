import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { GeminiEmbeddingService } from '../embedding/gemini-embedding.service';
import { OpenAIChatService } from './openai-chat.service';
import { AskChatDto } from './dto/ask-chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
    private readonly embedding: GeminiEmbeddingService,
    private readonly openaiChat: OpenAIChatService,
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

    const systemPrompt = this.buildSystemPrompt(
      contextChunks,
      dto.language ?? 'en',
    );

    let reply: string;
    try {
      reply = await this.openaiChat.generateReply(systemPrompt, message);
    } catch (e) {
      // ServiceUnavailableException (busy/overloaded) propagates as-is.
      if (e instanceof ServiceUnavailableException) {
        throw e;
      }
      const err = e instanceof Error ? e.message : String(e);
      this.logger.error(`OpenAI generation failed: ${err}`);
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

  private buildSystemPrompt(contextChunks: string[], language: string): string {
    const lang = language === 'de' ? 'German' : 'English';
    const persona = `You are a warm, professional coach and psychologist. Answer using the knowledge base context when it is relevant. If the context does not contain enough information, say so honestly and give safe, general coaching guidance. Be concise and supportive. Always respond in ${lang}.`;

    let contextBlock: string;
    if (contextChunks.length) {
      let joined = contextChunks
        .map((c, i) => `[${i + 1}] ${c.trim()}`)
        .join('\n\n');
      const maxChars = Number(
        this.config.get('RAG_CONTEXT_MAX_CHARS', 24000),
      );
      if (joined.length > maxChars) {
        joined = `${joined.slice(0, maxChars)}\n\n[Context truncated…]`;
      }
      contextBlock = joined;
    } else {
      contextBlock = '(No matching passages were found in the knowledge base.)';
    }

    return `${persona}

### Knowledge base excerpts
${contextBlock}`;
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
