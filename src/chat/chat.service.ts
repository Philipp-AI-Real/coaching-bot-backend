import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoachingItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { CoachingItemsService } from '../coaching-items/coaching-items.service';
import { CpmProcessService } from '../cpm-process/cpm-process.service';
import { CPM_TOOLS } from '../cpm-process/cpm-tools';
import { OpenAIChatService } from './openai-chat.service';
import { AskChatDto } from './dto/ask-chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
    private readonly embedding: EmbeddingService,
    private readonly coachingItems: CoachingItemsService,
    private readonly cpm: CpmProcessService,
    private readonly openaiChat: OpenAIChatService,
    private readonly config: ConfigService,
  ) {}

  async ask(userId: number, tenantId: number, dto: AskChatDto) {
    const message = dto.message?.trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    const topK = Number(this.config.get('RAG_TOP_K', 8));

    let hits: Awaited<ReturnType<QdrantService['searchKnowledge']>>;
    try {
      const vector = await this.embedding.embedQuery(message);
      // Retrieval is scoped to the caller's tenant.
      hits = await this.qdrant.searchKnowledge(vector, topK, tenantId);
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

    // Load the user's active coaching items so the AI has full context on what
    // they are working on. Failure here must not break chat — degrade gracefully.
    let openItems: CoachingItem[] = [];
    try {
      openItems = await this.coachingItems.findOpenItemsForPrompt(
        userId,
        tenantId,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Could not load open coaching items: ${err}`);
    }

    // CPM process tools — enabled only when this tenant is mapped to a CPM source
    // and that source has a catalogue. The catalogue (the tenant's repository
    // graph) is injected into the system prompt as the vocabulary/whitelist.
    let cpmCatalogue: string | null = null;
    let cpmSourceId: number | null = null;
    try {
      cpmSourceId = this.cpm.resolveSourceId(tenantId);
      if (cpmSourceId !== null) {
        cpmCatalogue = await this.cpm.getPromptCatalogue(cpmSourceId);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.logger.warn(`CPM catalogue unavailable, process tools disabled: ${err}`);
      cpmCatalogue = null;
    }

    const systemPrompt = this.buildSystemPrompt(
      contextChunks,
      dto.language ?? 'en',
      openItems,
      cpmCatalogue,
    );

    const cpmEnabled = cpmCatalogue !== null && cpmSourceId !== null;

    let result: Awaited<ReturnType<OpenAIChatService['generateReply']>>;
    try {
      result = await this.openaiChat.generateReply(systemPrompt, message, {
        enableItemSuggestion: true,
        ...(cpmEnabled
          ? {
              extraTools: CPM_TOOLS,
              executeTool: (name, args) =>
                this.cpm.run(name, args, cpmSourceId as number),
            }
          : {}),
      });
    } catch (e) {
      // ServiceUnavailableException (busy/overloaded) propagates as-is.
      if (e instanceof ServiceUnavailableException) {
        throw e;
      }
      const err = e instanceof Error ? e.message : String(e);
      this.logger.error(`OpenAI generation failed: ${err}`);
      throw new ServiceUnavailableException(`Coach reply failed: ${err}`);
    }

    const reply = result.text;

    // Both messages are stored as belonging to the requesting user + tenant.
    // The suggested item is NOT persisted — it is only returned for the user to
    // confirm and create explicitly via POST /coaching-items.
    // Persisting the history must NOT fail the request: the user already has a
    // valid answer, so a storage error degrades to a warning, like the
    // coaching-items load above.
    try {
      await this.prisma.$transaction([
        this.prisma.chatMessage.create({
          data: { userId, tenantId, role: 'user', content: message },
        }),
        this.prisma.chatMessage.create({
          data: { userId, tenantId, role: 'assistant', content: reply },
        }),
      ]);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Could not persist chat messages: ${err}`);
    }

    return {
      reply,
      ...(result.suggestedItem ? { suggestedItem: result.suggestedItem } : {}),
    };
  }

  private buildSystemPrompt(
    contextChunks: string[],
    language: string,
    openItems: CoachingItem[] = [],
    cpmCatalogue: string | null = null,
  ): string {
    const lang = language === 'de' ? 'German' : 'English';
    const persona = `You are a warm, professional coach and psychologist. Answer using the knowledge base context when it is relevant. If the context does not contain enough information, say so honestly and give safe, general coaching guidance. Be concise and supportive. Always respond in ${lang}.`;

    // Active coaching items block — injected before the knowledge base context.
    // Omitted entirely when the user has no open items.
    const itemsBlock = this.buildOpenItemsBlock(openItems);

    // CPM process-repository block — only when the feature is on for this tenant.
    const cpmBlock = this.buildCpmBlock(cpmCatalogue);

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
${itemsBlock}${cpmBlock}
### Knowledge base excerpts
${contextBlock}`;
  }

  // Renders the CPM repository graph + tool guidance. Empty when the feature is
  // off. The catalogue is the authority on what is answerable: the model must not
  // invent relations, and must say "not recorded" for anything not listed.
  private buildCpmBlock(cpmCatalogue: string | null): string {
    if (!cpmCatalogue) return '';
    return `
### Process repository (CPM)
You can answer questions about the organisation's business-process repository using the process tools (search_elements, traverse, get_process_hierarchy, get_element). The graph below is authoritative for THIS tenant: only the listed object types and relations carry data. Never invent a relation or facet name. If a question needs something not in the graph, tell the user it is not recorded rather than guessing. Cite object names, and include the CPM permalink when a tool returns one.

${cpmCatalogue}
`;
  }

  // Renders the user's active coaching items as a compact, prioritised block.
  // Returns an empty string when there are no items (no prompt change).
  private buildOpenItemsBlock(openItems: CoachingItem[]): string {
    if (!openItems.length) return '';

    const lines = openItems
      .map((item) => {
        const due = item.dueDate
          ? item.dueDate.toISOString().slice(0, 10)
          : 'none';
        return `- [${item.status}] (${item.type}) ${item.title} (due: ${due})`;
      })
      .join('\n');

    return `
### Your current coaching items
The user is actively working on these. Use them for continuity and accountability.
${lines}
`;
  }

  async getHistory(userId: number, tenantId: number, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    // Only the requesting user's own messages, scoped to their tenant.
    const where = { userId, tenantId };
    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
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
      this.prisma.chatMessage.count({ where }),
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
