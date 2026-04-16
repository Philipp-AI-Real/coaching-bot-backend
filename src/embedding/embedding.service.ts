import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';
const DEFAULT_EMBED_DIM = 1536;
const DEFAULT_BATCH_SIZE = 100;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model =
      this.config.get<string>('OPENAI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_EMBED_MODEL;
  }

  get vectorSize(): number {
    return DEFAULT_EMBED_DIM;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    return this.client;
  }

  async embedText(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot embed empty text');
    }

    const client = this.getClient();
    const response = await client.embeddings.create({
      model: this.model,
      input: trimmed,
    });

    const values = response.data[0]?.embedding;
    if (!values?.length) {
      throw new Error('OpenAI embedding response missing values');
    }
    return values;
  }

  // OpenAI embeddings are bidirectional — same model handles documents and queries.
  async embedQuery(text: string): Promise<number[]> {
    return this.embedText(text);
  }

  async embedTexts(
    texts: string[],
    batchSize = DEFAULT_BATCH_SIZE,
  ): Promise<number[][]> {
    const out: number[][] = [];
    const client = this.getClient();

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      const response = await client.embeddings.create({
        model: this.model,
        input: slice,
      });

      if (response.data.length !== slice.length) {
        this.logger.error(
          `Batch embed mismatch: expected ${slice.length} embeddings, got ${response.data.length}`,
        );
        throw new Error('OpenAI batch embedding response incomplete');
      }

      for (const item of response.data) {
        if (!item.embedding?.length) {
          throw new Error('OpenAI embedding response missing values');
        }
        out.push(item.embedding);
      }
    }

    return out;
  }
}
