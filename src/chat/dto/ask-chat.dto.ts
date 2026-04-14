import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AskChatDto {
  @ApiProperty({ description: 'User question for the coach', maxLength: 8000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message: string;

  @ApiPropertyOptional({
    description: 'Response language (Gemini will reply in this language)',
    enum: ['en', 'de'],
    default: 'en',
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'de'])
  language?: string;
}
