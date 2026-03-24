import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AskChatDto {
  @ApiProperty({ description: 'User question for the coach', maxLength: 8000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message: string;
}
