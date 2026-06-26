import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    description:
      'Tenant slug the user belongs to. Defaults to "default" when omitted.',
    example: 'default',
    default: 'default',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantSlug?: string;
}
