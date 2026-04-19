import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    enum: ['en', 'de'],
    description: 'Preferred UI / coach response language',
  })
  @IsOptional()
  @IsIn(['en', 'de'])
  defaultLanguage?: 'en' | 'de';

  @ApiPropertyOptional({
    description: 'Whether the coach voice (TTS) should play by default',
  })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;
}
