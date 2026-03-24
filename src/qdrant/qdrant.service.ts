import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  readonly client: QdrantClient;
  private readonly collection: string;
  private readonly vectorSize: number;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('QDRANT_HOST', 'localhost');
    const port = Number(this.config.get('QDRANT_PORT', 6333));
    const apiKey = this.config.get<string>('QDRANT_API_KEY');
    const useTls = this.config.get<string>('QDRANT_USE_TLS') === 'true';

    const url = useTls ? `https://${host}:${port}` : `http://${host}:${port}`;
    this.client = new QdrantClient({
      url,
      apiKey: apiKey || undefined,
    });
    this.collection = this.config.get<string>(
      'QDRANT_COLLECTION',
      'coaching_knowledge',
    );
    this.vectorSize = Number(this.config.get('QDRANT_VECTOR_SIZE', 768));
  }

  get collectionName(): string {
    return this.collection;
  }

  async onModuleInit() {
    const { collections } = await this.client.getCollections();
    const exists = collections.some((c) => c.name === this.collection);
    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: {
          size: this.vectorSize,
          distance: 'Cosine',
        },
      });
      this.logger.log(
        `Created Qdrant collection "${this.collection}" (${this.vectorSize}d)`,
      );
    }
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: number): Promise<void> {
    await this.client.delete(this.collection, {
      filter: {
        must: [
          {
            key: 'knowledgeBaseId',
            match: { value: knowledgeBaseId },
          },
        ],
      },
    });
  }

  async searchKnowledge(
    vector: number[],
    limit: number,
  ): Promise<
    Array<{
      score: number;
      knowledgeBaseId: number;
      chunkIndex: number;
      text: string;
    }>
  > {
    const res = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
    });

    return res.map((hit) => {
      const p = hit.payload as Record<string, unknown> | null | undefined;
      const knowledgeBaseId = Number(p?.knowledgeBaseId ?? 0);
      const chunkIndex = Number(p?.chunkIndex ?? 0);
      const text = typeof p?.text === 'string' ? p.text : '';
      return {
        score: hit.score ?? 0,
        knowledgeBaseId,
        chunkIndex,
        text,
      };
    });
  }
}
