import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';

@Injectable()
export class GeminiChatService {
  private readonly client: GoogleGenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
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
  }): Promise<string> {
    const model =
      this.config.get<string>('GEMINI_CHAT_MODEL')?.trim() ||
      DEFAULT_CHAT_MODEL;

    const system = `You are a warm, professional coach and psychologist. Answer using the knowledge base context when it is relevant. If the context does not contain enough information, say so honestly and give safe, general coaching guidance. Be concise and supportive.`;

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
  }
}
