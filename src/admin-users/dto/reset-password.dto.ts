import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../admin-users.constants';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'New password (plaintext; hashed server-side)',
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}
