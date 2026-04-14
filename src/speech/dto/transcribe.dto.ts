import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class TranscribeDto {
  @ApiPropertyOptional({
    description: 'Language of the audio',
    enum: ['en', 'de'],
    default: 'en',
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'de'])
  language?: string = 'en';
}

export class TranscribeResponseData {
  @ApiProperty({ description: 'Transcribed text from audio' })
  text: string;
}
