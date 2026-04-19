import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  username: string;

  @ApiProperty({ enum: ['admin', 'user'] })
  role: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Relative path to avatar image (prepend FILES_PUBLIC_BASE_URL)',
  })
  avatarUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Relative path to logo image (prepend FILES_PUBLIC_BASE_URL)',
  })
  logoUrl: string | null;

  @ApiProperty({ enum: ['en', 'de'] })
  defaultLanguage: string;

  @ApiProperty()
  soundEnabled: boolean;
}
