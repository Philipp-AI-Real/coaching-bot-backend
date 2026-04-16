import { ApiProperty } from '@nestjs/swagger';

export class BatchUploadSucceededItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  originalFilename: string;

  @ApiProperty()
  chunkCount: number;
}

export class BatchUploadFailedItemDto {
  @ApiProperty()
  filename: string;

  @ApiProperty()
  error: string;
}

export class BatchUploadResponseDto {
  @ApiProperty({ type: [BatchUploadSucceededItemDto] })
  uploaded: BatchUploadSucceededItemDto[];

  @ApiProperty({ type: [BatchUploadFailedItemDto] })
  failed: BatchUploadFailedItemDto[];

  @ApiProperty({ description: 'Total files received in the request' })
  total: number;

  @ApiProperty({ description: 'Number of files that ingested successfully' })
  succeeded: number;

  @ApiProperty({ description: 'Number of files that failed to ingest' })
  failed_count: number;
}
