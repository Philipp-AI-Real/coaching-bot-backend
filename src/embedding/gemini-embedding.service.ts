import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const EMBED_MODEL = 'gemini-embedding-2-preview';
const EMBED_DIM = 768;

@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
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
   * Single text embedding via @google/genai (768 dims via outputDimensionality).
   */
  async embedText(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot embed empty text');
    }

    const ai = this.getClient();
    const response = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: trimmed,
      config: {
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: EMBED_DIM,
      },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values?.length) {
      throw new Error('Gemini embedding response missing values');
    }
    if (values.length !== EMBED_DIM) {
      this.logger.warn(
        `Expected ${EMBED_DIM} dims, got ${values.length}; using returned vector`,
      );
    }
    return values;
  }

  /**
   * Embedding for user search queries (RAG retrieval). Uses RETRIEVAL_QUERY for better match vs document chunks.
   */
  async embedQuery(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot embed empty query');
    }

    const ai = this.getClient();
    const response = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: trimmed,
      config: {
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: EMBED_DIM,
      },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values?.length) {
      throw new Error('Gemini embedding response missing values');
    }
    return values;
  }

  /**
   * Embeds many chunks: batches multiple strings per SDK call, then advances in batches of `batchSize` requests.
   */
  async embedTexts(texts: string[], batchSize = 5): Promise<number[][]> {
    const out: number[][] = [];
    const ai = this.getClient();

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      const response = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: slice,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: EMBED_DIM,
        },
      });

      const embeddings = response.embeddings;
      if (!embeddings?.length || embeddings.length !== slice.length) {
        this.logger.error(
          `Batch embed mismatch: expected ${slice.length} embeddings, got ${embeddings?.length ?? 0}`,
        );
        throw new Error('Gemini batch embedding response incomplete');
      }

      for (const emb of embeddings) {
        const values = emb.values;
        if (!values?.length) {
          throw new Error('Gemini embedding response missing values');
        }
        out.push(values);
      }
    }

    return out;
  }
}
