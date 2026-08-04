import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Safe representation of a user for admin views. NEVER includes passwordHash.
export class AdminUserResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  tenantId: number;

  @ApiProperty()
  username: string;

  @ApiProperty({ description: 'superadmin | tenant_admin | user' })
  role: string;

  @ApiProperty({ enum: ['en', 'de'] })
  defaultLanguage: string;

  @ApiProperty()
  soundEnabled: boolean;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiProperty({ description: 'ISO 8601' })
  createdAt: string;
}

export class AdminUsersListDataDto {
  @ApiProperty({ type: [AdminUserResponseDto] })
  items: AdminUserResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
