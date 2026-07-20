import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CoachingItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACTIVE_STATUSES,
  MAX_PROMPT_ITEMS,
} from './coaching-items.constants';
import { CoachingItemResponseDto } from './dto/coaching-item-response.dto';
import { CreateCoachingItemDto } from './dto/create-coaching-item.dto';
import { ListCoachingItemsQueryDto } from './dto/list-coaching-items-query.dto';
import { UpdateCoachingItemDto } from './dto/update-coaching-item.dto';

@Injectable()
export class CoachingItemsService {
  private readonly logger = new Logger(CoachingItemsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toResponse(row: CoachingItem): CoachingItemResponseDto {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      status: row.status,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(
    userId: number,
    tenantId: number,
    dto: CreateCoachingItemDto,
  ): Promise<CoachingItemResponseDto> {
    const status = dto.status ?? 'open';
    const created = await this.prisma.coachingItem.create({
      data: {
        tenantId,
        userId,
        type: dto.type,
        title: dto.title,
        description: dto.description ?? null,
        status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        // Stamp completion time if the item is created already completed.
        completedAt: status === 'completed' ? new Date() : null,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        createdBy: dto.createdBy ?? 'user',
      },
    });
    return this.toResponse(created);
  }

  async findAll(
    userId: number,
    tenantId: number,
    filters: ListCoachingItemsQueryDto = {},
  ): Promise<{ items: CoachingItemResponseDto[]; total: number }> {
    // Strict isolation: a user only ever sees their own items in their tenant.
    const where: Prisma.CoachingItemWhereInput = { userId, tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;

    const rows = await this.prisma.coachingItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const items = rows.map((r) => this.toResponse(r));
    return { items, total: items.length };
  }

  async findOne(
    id: number,
    userId: number,
    tenantId: number,
  ): Promise<CoachingItemResponseDto> {
    const row = await this.findOwnedOr404(id, userId, tenantId);
    return this.toResponse(row);
  }

  async update(
    id: number,
    userId: number,
    tenantId: number,
    dto: UpdateCoachingItemDto,
  ): Promise<CoachingItemResponseDto> {
    const existing = await this.findOwnedOr404(id, userId, tenantId);

    const data: Prisma.CoachingItemUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.metadata !== undefined) {
      data.metadata = dto.metadata as Prisma.InputJsonValue;
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      data.status = dto.status;
      // Auto-manage completion timestamp on status transitions.
      if (dto.status === 'completed') {
        data.completedAt = new Date();
      } else if (existing.status === 'completed') {
        data.completedAt = null;
      }
    }

    const updated = await this.prisma.coachingItem.update({
      where: { id },
      data,
    });
    return this.toResponse(updated);
  }

  async remove(id: number, userId: number, tenantId: number): Promise<void> {
    await this.findOwnedOr404(id, userId, tenantId);
    await this.prisma.coachingItem.delete({ where: { id } });
  }

  // Used by ChatService to inject the user's active items into the system prompt.
  // Prioritised by due date (soonest first), undated items last.
  async findOpenItemsForPrompt(
    userId: number,
    tenantId: number,
    take = MAX_PROMPT_ITEMS,
  ): Promise<CoachingItem[]> {
    return this.prisma.coachingItem.findMany({
      where: { userId, tenantId, status: { in: ACTIVE_STATUSES } },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
      take,
    });
  }

  // findFirst with id + userId + tenantId so another user's (or tenant's) id
  // returns 404, never a 403 or a cross-user data leak.
  private async findOwnedOr404(
    id: number,
    userId: number,
    tenantId: number,
  ): Promise<CoachingItem> {
    const row = await this.prisma.coachingItem.findFirst({
      where: { id, userId, tenantId },
    });
    if (!row) throw new NotFoundException(`Coaching item ${id} not found`);
    return row;
  }
}
