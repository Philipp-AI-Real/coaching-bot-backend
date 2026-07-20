import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  COACHING_ITEM_CREATED_BY,
  COACHING_ITEM_STATUSES,
} from '../coaching-items.constants';

export class CoachingItemResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ description: 'Open string type, e.g. "habit"' })
  type: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: COACHING_ITEM_STATUSES })
  status: string;

  @ApiPropertyOptional({ description: 'ISO 8601', nullable: true })
  dueDate: string | null;

  @ApiPropertyOptional({ description: 'ISO 8601', nullable: true })
  completedAt: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata: Record<string, unknown>;

  @ApiProperty({ enum: COACHING_ITEM_CREATED_BY })
  createdBy: string;

  @ApiProperty({ description: 'ISO 8601' })
  createdAt: string;

  @ApiProperty({ description: 'ISO 8601' })
  updatedAt: string;
}
