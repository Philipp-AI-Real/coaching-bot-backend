import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SynthesizeDto {
  @ApiProperty({ description: 'Text to convert to speech', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text: string;

  @ApiProperty({ description: 'Language / voice selection', enum: ['en', 'de'], default: 'en' })
  @IsString()
  @IsIn(['en', 'de'])
  language: string = 'en';
}
