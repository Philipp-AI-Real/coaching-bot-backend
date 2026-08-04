import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ASSIGNABLE_ROLES,
  MAX_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  SUPPORTED_LANGUAGES,
} from '../admin-users.constants';

export class CreateUserDto {
  @ApiProperty({
    description: 'Username — unique within the tenant',
    minLength: MIN_USERNAME_LENGTH,
    maxLength: MAX_USERNAME_LENGTH,
    example: 'patient1',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(MIN_USERNAME_LENGTH)
  @MaxLength(MAX_USERNAME_LENGTH)
  username: string;

  @ApiProperty({
    description: 'Initial password (plaintext; hashed server-side)',
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;

  @ApiPropertyOptional({
    description: 'Role to assign. "superadmin" cannot be assigned here.',
    enum: ASSIGNABLE_ROLES,
    default: 'user',
  })
  @IsOptional()
  @IsString()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[])
  role?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES, default: 'en' })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES as unknown as string[])
  defaultLanguage?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;
}
