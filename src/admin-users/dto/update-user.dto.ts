import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ASSIGNABLE_ROLES, SUPPORTED_LANGUAGES } from '../admin-users.constants';

// All fields optional; the service rejects an empty body with a 400.
// Password is NOT updatable here — use PATCH /admin/users/:id/password.
export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'New role. "superadmin" cannot be assigned here.',
    enum: ASSIGNABLE_ROLES,
  })
  @IsOptional()
  @IsString()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[])
  role?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES as unknown as string[])
  defaultLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;
}
