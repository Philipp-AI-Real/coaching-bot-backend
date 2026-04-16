import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 4000];

@Injectable()
export class OpenAIChatService {
  private readonly logger = new Logger(OpenAIChatService.name);
  private readonly client: OpenAI | null;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    this.client = this.apiKey ? new OpenAI({ apiKey: this.apiKey }) : null;
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
  ): Promise<string> {
    const client = this.getClient();
    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || DEFAULT_CHAT_MODEL;
    const temperature = Number(
      this.config.get('OPENAI_CHAT_TEMPERATURE', 0.7),
    );
    const maxTokens = Number(
      this.config.get('OPENAI_CHAT_MAX_OUTPUT_TOKENS', 2048),
    );

    this.logger.debug(
      `[OpenAI call] model="${model}" apiKeyPrefix="${this.apiKey.slice(0, 10)}..." userMessageLen=${userMessage.length}`,
    );

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
        });

        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) {
          throw new Error('OpenAI returned an empty response');
        }
        return text;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `[Attempt ${attempt}/${MAX_RETRIES}] OpenAI call failed: ${errMsg}`,
        );

        if (attempt < MAX_RETRIES && this.isRetryable(e)) {
          const delayMs =
            RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!;
          this.logger.warn(
            `[Attempt ${attempt}/${MAX_RETRIES}] OpenAI overloaded, retrying in ${delayMs / 1000}s...`,
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
