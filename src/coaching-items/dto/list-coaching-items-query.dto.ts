import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  COACHING_ITEM_STATUSES,
  MAX_TYPE_LENGTH,
} from '../coaching-items.constants';

export class ListCoachingItemsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: COACHING_ITEM_STATUSES,
  })
  @IsOptional()
  @IsString()
  @IsIn(COACHING_ITEM_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by type', maxLength: MAX_TYPE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TYPE_LENGTH)
  type?: string;
}
