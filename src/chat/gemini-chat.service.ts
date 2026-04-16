import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';

@Injectable()
export class GeminiChatService {
  private readonly logger = new Logger(GeminiChatService.name);
  private readonly client: GoogleGenAI | null;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    return this.client;
  }

  /**
   * Generates a coach reply using Gemini (free-tier friendly flash model by default).
   */
  async generateCoachReply(params: {
    userMessage: string;
    contextChunks: string[];
    language?: string;
  }): Promise<string> {
    const model =
      this.config.get<string>('GEMINI_CHAT_MODEL')?.trim() ||
      DEFAULT_CHAT_MODEL;

    const lang = params.language === 'de' ? 'German' : 'English';
    const system = `You are a warm, professional coach and psychologist. Answer using the knowledge base context when it is relevant. If the context does not contain enough information, say so honestly and give safe, general coaching guidance. Be concise and supportive. Always respond in ${lang}.`;

    let contextBlock = '';
    if (params.contextChunks.length) {
      contextBlock = params.contextChunks
        .map((c, i) => `[${i + 1}] ${c.trim()}`)
        .join('\n\n');
      const maxChars = Number(this.config.get('RAG_CONTEXT_MAX_CHARS', 24000));
      if (contextBlock.length > maxChars) {
        contextBlock = `${contextBlock.slice(0, maxChars)}\n\n[Context truncated…]`;
      }
    } else {
      contextBlock = '(No matching passages were found in the knowledge base.)';
    }

    const prompt = `${system}

    ### Knowledge base excerpts
    ${contextBlock}

    ### User message
    ${params.userMessage.trim()}`;

    const ai = this.getClient();

    this.logger.debug(
      `[Gemini call] model="${model}" apiKeyPrefix="${this.apiKey.slice(0, 10)}..." messageLen=${params.userMessage.length} contextChunks=${params.contextChunks.length}`,
    );

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: Number(this.config.get('GEMINI_CHAT_TEMPERATURE', 0.7)),
          maxOutputTokens: Number(
            this.config.get('GEMINI_CHAT_MAX_OUTPUT_TOKENS', 2048),
          ),
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error('Gemini returned an empty response');
      }
      return text;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.logger.error(`[Gemini error] model="${model}" → ${err}`);
      throw e;
    }
  }
}
