import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { KnowledgeBaseDocument } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import pdf from 'pdf-parse';
import { KnowledgeBaseResponseDto } from './dto/knowledge-base-response.dto';
import { BatchUploadResponseDto } from './dto/batch-upload-response.dto';

const ALLOWED_EXT = new Set(['.txt', '.json', '.pdf']);
const MAX_BATCH_FILES = 20;

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
    private readonly embedding: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  private projectRoot(): string {
    return process.cwd();
  }

  private uploadDir(): string {
    return join(this.projectRoot(), 'storage', 'knowledge-base');
  }

  private buildFileUrl(relativePath: string): string | undefined {
    const base = this.config.get<string>('FILES_PUBLIC_BASE_URL');
    if (!base?.trim()) return undefined;
    const cleanBase = base.replace(/\/$/, '');
    const cleanPath = relativePath.replace(/^\//, '');
    return `${cleanBase}/${cleanPath}`;
  }

  private toResponse(row: KnowledgeBaseDocument): KnowledgeBaseResponseDto {
    return {
      id: row.id,
      title: row.title,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      relativePath: row.relativePath,
      fileUrl: this.buildFileUrl(row.relativePath),
      chunkCount: row.chunkCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private getChunkConfig(): { size: number; overlap: number } {
    const size = Number(this.config.get('CHUNK_SIZE', 800));
    const overlap = Number(this.config.get('CHUNK_OVERLAP', 100));
    return { size, overlap };
  }

  private chunkText(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const chunks: string[] = [];
    let start = 0;
    while (start < normalized.length) {
      const end = Math.min(start + chunkSize, normalized.length);
      chunks.push(normalized.slice(start, end));
      if (end === normalized.length) break;
      start = Math.max(0, end - overlap);
    }
    return chunks.filter((c) => c.trim().length > 0);
  }

  private sanitizeFilename(name: string): string {
    const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
    return base || 'file';
  }

  private extFromName(name: string): string {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  }

  private async extractPlainText(
    buffer: Buffer,
    mime: string | undefined,
    originalName: string,
  ): Promise<string> {
    const ext = this.extFromName(originalName);
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(
        'Unsupported file extension. Use .txt, .json, or .pdf',
      );
    }

    if (mime === 'application/pdf' || ext === '.pdf') {
      const data = await pdf(buffer);
      return data.text ?? '';
    }

    if (mime === 'application/json' || ext === '.json') {
      const raw = buffer.toString('utf8');
      try {
        const parsed = JSON.parse(raw) as unknown;
        return typeof parsed === 'string'
          ? parsed
          : JSON.stringify(parsed, null, 2);
      } catch {
        return raw;
      }
    }

    if (mime === 'text/plain' || ext === '.txt' || mime === 'text/markdown') {
      return buffer.toString('utf8');
    }

    throw new BadRequestException(
      'Unsupported file type. Use .txt, .json, or .pdf',
    );
  }

  private async ensureUploadDir(): Promise<void> {
    await fs.mkdir(this.uploadDir(), { recursive: true });
  }

  private async ingestIntoQdrant(
    knowledgeBaseId: number,
    chunks: string[],
  ): Promise<void> {
    if (!chunks.length) return;
    const vectors = await this.embedding.embedTexts(chunks);
    const collection = this.qdrant.collectionName;
    const expectedSize = this.qdrant.expectedVectorSize;
    const actualSize = vectors[0]?.length ?? 0;

    this.logger.log(
      `Ingest kb=${knowledgeBaseId} → collection="${collection}", chunks=${chunks.length}, vectorDim=${actualSize}, expected=${expectedSize}`,
    );

    if (actualSize !== expectedSize) {
      throw new Error(
        `Embedding dimension mismatch: collection expects ${expectedSize} but embeddings are ${actualSize}. ` +
          `Check QDRANT_VECTOR_SIZE in .env matches the embedding model's output dimensions.`,
      );
    }

    const batchSize = 64;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const sliceChunks = chunks.slice(i, i + batchSize);
      const sliceVectors = vectors.slice(i, i + batchSize);
      const points = sliceChunks.map((text, j) => ({
        id: randomUUID(),
        vector: sliceVectors[j],
        payload: {
          knowledgeBaseId,
          chunkIndex: i + j,
          text,
        },
      }));
      await this.qdrant.client.upsert(collection, { wait: true, points });
    }
  }

  async createFromUpload(
    file: Express.Multer.File | undefined,
    title?: string,
  ): Promise<KnowledgeBaseResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const ext = this.extFromName(file.originalname);
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(
        'Unsupported file extension. Use .txt, .json, or .pdf',
      );
    }

    let plain: string;
    try {
      plain = await this.extractPlainText(
        file.buffer,
        file.mimetype,
        file.originalname,
      );
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(e);
      throw new BadRequestException('Could not read file content');
    }

    const { size: chunkSize, overlap } = this.getChunkConfig();
    const chunks = this.chunkText(plain, chunkSize, overlap);
    if (!chunks.length) {
      throw new BadRequestException('No text content to index after parsing');
    }

    await this.ensureUploadDir();
    const safe = this.sanitizeFilename(file.originalname);
    const relativePath = join(
      'storage',
      'knowledge-base',
      `${randomUUID()}-${safe}`,
    ).replace(/\\/g, '/');

    const absolutePath = join(this.projectRoot(), relativePath);
    await fs.writeFile(absolutePath, file.buffer);

    const created = await this.prisma.knowledgeBaseDocument.create({
      data: {
        title: title?.trim() || null,
        originalFilename: file.originalname,
        mimeType: file.mimetype || null,
        relativePath,
        chunkCount: 0,
      },
    });

    try {
      await this.ingestIntoQdrant(created.id, chunks);
      const updated = await this.prisma.knowledgeBaseDocument.update({
        where: { id: created.id },
        data: { chunkCount: chunks.length },
      });
      return this.toResponse(updated);
    } catch (e) {
      this.logger.error(
        `Failed to ingest document ${created.id} (${file.originalname})`,
        e instanceof Error ? e.stack : String(e),
      );
      await this.safeDeleteFile(absolutePath);
      await this.prisma.knowledgeBaseDocument
        .delete({ where: { id: created.id } })
        .catch(() => undefined);
      throw e;
    }
  }

  async createFromUploadBatch(
    files: Express.Multer.File[] | undefined,
  ): Promise<BatchUploadResponseDto> {
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }
    if (files.length > MAX_BATCH_FILES) {
      throw new BadRequestException(
        `Too many files. Maximum is ${MAX_BATCH_FILES} per request.`,
      );
    }

    const uploaded: BatchUploadResponseDto['uploaded'] = [];
    const failed: BatchUploadResponseDto['failed'] = [];

    // Sequential processing — avoids overwhelming Qdrant/Gemini.
    for (const file of files) {
      const filename = file?.originalname ?? 'unknown';
      try {
        const result = await this.createFromUpload(file);
        uploaded.push({
          id: result.id,
          originalFilename: result.originalFilename,
          chunkCount: result.chunkCount,
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Batch upload — failed for "${filename}": ${error}`);
        failed.push({ filename, error });
      }
    }

    return {
      uploaded,
      failed,
      total: files.length,
      succeeded: uploaded.length,
      failed_count: failed.length,
    };
  }

  private async safeDeleteFile(absolutePath: string): Promise<void> {
    try {
      await fs.unlink(absolutePath);
    } catch {
      /* ignore */
    }
  }

  async findAll(): Promise<KnowledgeBaseResponseDto[]> {
    const rows = await this.prisma.knowledgeBaseDocument.findMany({
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findOne(id: number): Promise<KnowledgeBaseResponseDto> {
    const row = await this.prisma.knowledgeBaseDocument.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException(`Knowledge base ${id} not found`);
    return this.toResponse(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.prisma.knowledgeBaseDocument.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException(`Knowledge base ${id} not found`);

    await this.qdrant.deleteByKnowledgeBaseId(id);
    const abs = join(this.projectRoot(), row.relativePath);
    await this.safeDeleteFile(abs);
    await this.prisma.knowledgeBaseDocument.delete({ where: { id } });
  }
}
