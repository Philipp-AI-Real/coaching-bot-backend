import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KnowledgeBaseResponseDto {
  @ApiProperty()
  id: number;

  @ApiPropertyOptional()
  title: string | null;

  @ApiProperty()
  originalFilename: string;

  @ApiPropertyOptional()
  mimeType: string | null;

  @ApiProperty({
    description:
      'Path relative to project root (no host). Join with FILES_PUBLIC_BASE_URL for a full URL.',
  })
  relativePath: string;

  @ApiPropertyOptional({
    description: 'Only set when FILES_PUBLIC_BASE_URL is configured.',
  })
  fileUrl?: string;

  @ApiProperty()
  chunkCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
