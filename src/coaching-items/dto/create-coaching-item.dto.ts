import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  COACHING_ITEM_CREATED_BY,
  COACHING_ITEM_STATUSES,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TYPE_LENGTH,
} from '../coaching-items.constants';

export class CreateCoachingItemDto {
  @ApiProperty({
    description:
      'Item type — open string (e.g. milestone, homework, habit, commitment, reflection). Not an enum.',
    maxLength: MAX_TYPE_LENGTH,
    example: 'habit',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TYPE_LENGTH)
  type: string;

  @ApiProperty({ description: 'Short title of the item', maxLength: MAX_TITLE_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TITLE_LENGTH)
  title: string;

  @ApiPropertyOptional({ description: 'Optional details', maxLength: MAX_DESCRIPTION_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    description: 'Initial status',
    enum: COACHING_ITEM_STATUSES,
    default: 'open',
  })
  @IsOptional()
  @IsString()
  @IsIn(COACHING_ITEM_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ description: 'Optional due date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Flexible type-specific data',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Who created the item',
    enum: COACHING_ITEM_CREATED_BY,
    default: 'user',
  })
  @IsOptional()
  @IsString()
  @IsIn(COACHING_ITEM_CREATED_BY as unknown as string[])
  createdBy?: string;
}
