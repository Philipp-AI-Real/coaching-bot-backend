import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 4000];

// Hard ceiling for a single OpenAI request. The chat must NEVER hang longer
// than this — beyond it we abort and surface a ServiceUnavailableException.
const DEFAULT_TIMEOUT_MS = 30000;
// Backstop margin: if aborting the request does not reject promptly, this timer
// rejects the race so we can never wait indefinitely on a wedged socket.
const TIMEOUT_BACKSTOP_MS = 2000;

// Distinct error so timeouts are never silently classified as a generic 500.
class OpenAITimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAITimeoutError';
  }
}

// AI-suggested coaching item (not yet persisted — no id/timestamps).
export interface SuggestedCoachingItem {
  type: string;
  title: string;
  description?: string;
  dueDate?: string;
}

export interface GenerateReplyResult {
  text: string;
  suggestedItem?: SuggestedCoachingItem;
}

export interface GenerateReplyOptions {
  // When true, the model may call the suggest_coaching_item tool.
  enableItemSuggestion?: boolean;
  // Extra tools (e.g. the CPM process tools) the model may call. Unlike
  // suggest_coaching_item, their results are fed back so the model answers from
  // real data — see the tool loop in generateReply.
  extraTools?: ChatCompletionTool[];
  // Executor for extraTools. Returns a JSON-serialisable result (or { error }).
  // Must never throw for expected conditions — the loop relays whatever it gets.
  executeTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

// Upper bound on tool round-trips per reply. Bounds token spend and wall-clock;
// well above what any single question needs (search -> traverse -> answer).
const MAX_TOOL_STEPS = 4;

// Tool the model can call when it detects an actionable coaching intention.
const SUGGEST_ITEM_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'suggest_coaching_item',
    description:
      'Suggest a single structured coaching item when the user expresses a genuine, actionable coaching intention (a goal, habit, commitment, homework, or behavioural intention). Call at most once per reply. Do NOT call for vague chit-chat, questions, or when no clear intention is present.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'Item type, e.g. milestone, homework, behavior_goal, habit, commitment, reflection',
        },
        title: {
          type: 'string',
          description: 'Short, specific title of the item',
        },
        description: {
          type: 'string',
          description: 'Optional further detail',
        },
        dueDate: {
          type: 'string',
          description:
            'Optional ISO 8601 date (YYYY-MM-DD) if the user mentioned a timeframe',
        },
      },
      required: ['type', 'title'],
      additionalProperties: false,
    },
  },
};

@Injectable()
export class OpenAIChatService {
  private readonly logger = new Logger(OpenAIChatService.name);
  private readonly client: OpenAI | null;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    this.timeoutMs = Number(
      this.config.get('OPENAI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    );
    // maxRetries: 0 — this service owns the retry loop, so the SDK must not add
    // its own (which would multiply the wall-clock time before a failure).
    // timeout — a hard per-request ceiling enforced by the SDK as well.
    this.client = this.apiKey
      ? new OpenAI({
          apiKey: this.apiKey,
          timeout: this.timeoutMs,
          maxRetries: 0,
        })
      : null;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    return this.client;
  }

  async generateReply(
    systemPrompt: string,
    userMessage: string,
    opts: GenerateReplyOptions = {},
  ): Promise<GenerateReplyResult> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    this.logger.log(
      `[OpenAI] generateReply start: apiKeyPrefix="${this.apiKey.slice(0, 10)}..." userMessageLen=${userMessage.length} suggestions=${!!opts.enableItemSuggestion} timeout=${this.timeoutMs}ms`,
    );

    const tools: ChatCompletionTool[] = [];
    if (opts.enableItemSuggestion) tools.push(SUGGEST_ITEM_TOOL);
    if (opts.extraTools?.length) tools.push(...opts.extraTools);
    const toolsArg = tools.length ? tools : undefined;

    // Bounded tool loop. suggest_coaching_item keeps its one-shot semantics (its
    // result is a stub ack — we only capture the suggestion). extraTools (the CPM
    // process tools) get their real results fed back so the model can answer from
    // them, iterating until it produces text or the step budget is exhausted.
    let suggestedItem: SuggestedCoachingItem | undefined;

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const label = step === 0 ? 'primary' : `tool-step-${step}`;
      const completion = await this.createCompletion(messages, toolsArg, label);
      const msg = completion.choices[0]?.message;
      const toolCalls = msg?.tool_calls ?? [];

      // No tool call → the assistant content IS the reply.
      if (toolCalls.length === 0) {
        const text = msg?.content?.trim();
        if (!text) throw new Error('OpenAI returned an empty response');
        this.logger.log(`[OpenAI] generateReply done (step ${step}, no tool call)`);
        return suggestedItem ? { text, suggestedItem } : { text };
      }

      // OpenAI requires a tool response for EVERY tool_call_id before the next
      // turn. Record the assistant turn, then answer each call.
      messages.push(msg as ChatCompletionMessageParam);
      this.logger.log(
        `[OpenAI] step ${step} requested ${toolCalls.length} tool call(s)`,
      );

      for (const call of toolCalls) {
        if (call.type !== 'function') {
          messages.push(this.toolMessage(call.id, { status: 'acknowledged' }));
          continue;
        }
        const name = call.function.name;

        if (name === 'suggest_coaching_item') {
          // Capture the first suggestion only (max one per reply); ack it.
          if (!suggestedItem) {
            suggestedItem = this.parseSuggestedItem(call.function.arguments);
          }
          messages.push(this.toolMessage(call.id, { status: 'acknowledged' }));
          continue;
        }

        if (opts.executeTool) {
          let result: unknown;
          try {
            result = await opts.executeTool(
              name,
              this.parseToolArgs(call.function.arguments),
            );
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            this.logger.error(`[OpenAI] tool '${name}' execution failed: ${err}`);
            result = { error: 'tool execution failed' };
          }
          messages.push(this.toolMessage(call.id, result));
          continue;
        }

        // A tool was called that we cannot execute — tell the model.
        messages.push(this.toolMessage(call.id, { error: `unknown tool '${name}'` }));
      }
    }

    // Step budget exhausted: force a final text answer with tools disabled.
    this.logger.warn(`[OpenAI] tool loop hit MAX_TOOL_STEPS=${MAX_TOOL_STEPS}; forcing final answer`);
    const final = await this.createCompletion(messages, undefined, 'final');
    const text = final.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenAI returned an empty response');
    return suggestedItem ? { text, suggestedItem } : { text };
  }

  // Builds a role:'tool' response message for a given tool_call_id.
  private toolMessage(
    toolCallId: string,
    payload: unknown,
  ): ChatCompletionMessageParam {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify(payload),
    };
  }

  // Parse tool-call arguments defensively — the model can emit malformed JSON.
  private parseToolArgs(rawArgs: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(rawArgs || '{}');
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private parseSuggestedItem(rawArgs: string): SuggestedCoachingItem | undefined {
    try {
      const args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
      if (!args.type || !args.title) return undefined;
      const item: SuggestedCoachingItem = {
        type: String(args.type),
        title: String(args.title),
      };
      if (args.description) item.description = String(args.description);
      if (args.dueDate) item.dueDate = String(args.dueDate);
      return item;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Failed to parse suggest_coaching_item arguments: ${err}`);
      return undefined;
    }
  }

  // Single completion call, capped at timeoutMs, wrapped in the retry/backoff
  // policy. `label` identifies the call ("primary" / "follow-up") in the logs.
  private async createCompletion(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
    label: string,
  ): Promise<ChatCompletion> {
    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || DEFAULT_CHAT_MODEL;
    const temperature = Number(this.config.get('OPENAI_CHAT_TEMPERATURE', 0.7));
    const maxTokens = Number(
      this.config.get('OPENAI_CHAT_MAX_OUTPUT_TOKENS', 2048),
    );

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const startedAt = Date.now();
      this.logger.log(
        `[OpenAI ${label}] attempt ${attempt}/${MAX_RETRIES} → sending request (model="${model}", messages=${messages.length}, tools=${tools?.length ?? 0}, timeout=${this.timeoutMs}ms)`,
      );

      try {
        const completion = await this.callWithTimeout(
          (signal) =>
            this.getClient().chat.completions.create(
              {
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
                ...(tools ? { tools, tool_choice: 'auto' } : {}),
              },
              { signal, timeout: this.timeoutMs },
            ),
          label,
        );

        const choice = completion.choices[0];
        this.logger.log(
          `[OpenAI ${label}] response received in ${Date.now() - startedAt}ms (finish=${choice?.finish_reason ?? 'none'}, toolCalls=${choice?.message?.tool_calls?.length ?? 0}, contentLen=${choice?.message?.content?.length ?? 0}, tokens=${completion.usage?.total_tokens ?? 'n/a'})`,
        );
        return completion;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const timedOut = this.isTimeout(e);
        this.logger.error(
          `[OpenAI ${label}] attempt ${attempt}/${MAX_RETRIES} failed after ${Date.now() - startedAt}ms: ${timedOut ? 'TIMEOUT — ' : ''}${errMsg}`,
        );

        // Timeouts fail FAST: a single request already hit the 30s ceiling, so
        // retrying would just compound the wait. Surface a friendly 503
        // immediately — never retried into a multi-minute hang, never swallowed.
        if (timedOut) {
          throw new ServiceUnavailableException(
            'The AI coach took too long to respond. Please try again in a moment.',
          );
        }

        // Genuine transient errors (429 / 503 / overloaded) are retried with
        // backoff, each attempt still capped at the per-call timeout.
        if (attempt < MAX_RETRIES && this.isRetryable(e)) {
          const delayMs =
            RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!;
          this.logger.warn(
            `[OpenAI ${label}] transient error, retrying in ${delayMs / 1000}s...`,
          );
          await this.sleep(delayMs);
          continue;
        }

        if (this.isRetryable(e)) {
          throw new ServiceUnavailableException(
            'The AI coach is currently busy. Please try again in a moment.',
          );
        }
        throw e;
      }
    }

    // Unreachable: the loop either returns or throws.
    throw new ServiceUnavailableException(
      'The AI coach is currently busy. Please try again in a moment.',
    );
  }

  // Races the OpenAI request against a hard timeout. On timeout it aborts the
  // underlying request (via AbortController) AND rejects through a backstop
  // timer, so a wedged socket can never block the caller indefinitely.
  private async callWithTimeout(
    fn: (signal: AbortSignal) => Promise<ChatCompletion>,
    label: string,
  ): Promise<ChatCompletion> {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), this.timeoutMs);
    let backstopTimer: ReturnType<typeof setTimeout> | undefined;

    const backstop = new Promise<never>((_, reject) => {
      backstopTimer = setTimeout(
        () =>
          reject(
            new OpenAITimeoutError(
              `OpenAI ${label} call exceeded ${this.timeoutMs}ms`,
            ),
          ),
        this.timeoutMs + TIMEOUT_BACKSTOP_MS,
      );
    });

    try {
      return await Promise.race([fn(controller.signal), backstop]);
    } finally {
      clearTimeout(abortTimer);
      if (backstopTimer) clearTimeout(backstopTimer);
    }
  }

  // True when the error is a timeout / aborted request (our backstop, the SDK's
  // own timeout, or an abort triggered by our AbortController).
  private isTimeout(error: unknown): boolean {
    if (error instanceof OpenAITimeoutError) return true;
    if (error && typeof error === 'object') {
      const name = (error as { name?: string }).name;
      if (
        name === 'APIConnectionTimeoutError' ||
        name === 'APIUserAbortError' ||
        name === 'AbortError'
      ) {
        return true;
      }
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        msg.includes('aborted')
      );
    }
    return false;
  }

  private isRetryable(error: unknown): boolean {
    // OpenAI SDK throws APIError with a numeric .status property.
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 429 || status === 503) return true;
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('rate_limit') ||
        msg.includes('rate limit') ||
        msg.includes('overloaded') ||
        msg.includes('unavailable')
      );
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
