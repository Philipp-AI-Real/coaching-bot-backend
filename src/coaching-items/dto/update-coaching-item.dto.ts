import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  COACHING_ITEM_STATUSES,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
} from '../coaching-items.constants';

export class UpdateCoachingItemDto {
  @ApiPropertyOptional({ maxLength: MAX_TITLE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional({ maxLength: MAX_DESCRIPTION_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({ enum: COACHING_ITEM_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn(COACHING_ITEM_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({
    description: 'Due date (ISO 8601). Pass null to clear.',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
