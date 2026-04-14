import {
  Body,
  Controller,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'stream';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { SynthesizeDto } from './dto/synthesize.dto';
import { TranscribeDto } from './dto/transcribe.dto';
import { SpeechService } from './speech.service';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper limit)

@ApiTags('speech')
@Controller('speech')
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

  @Post('transcribe')
  @ResponseMessage('Audio transcribed successfully')
  @ApiOperation({ summary: 'Transcribe audio to text using OpenAI Whisper (whisper-1)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: { type: 'string', format: 'binary', description: 'Audio file (mp3, wav, webm, etc.)' },
        language: { type: 'string', enum: ['en', 'de'], default: 'en', description: 'Audio language' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Returns { text: string }' })
  @ApiResponse({ status: 400, description: 'Missing audio file' })
  @ApiResponse({ status: 503, description: 'Whisper API unavailable' })
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  transcribe(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: TranscribeDto,
  ) {
    return this.speech.transcribe(file, dto.language ?? 'en');
  }

  @Post('synthesize')
  @ApiOperation({ summary: 'Convert text to speech using ElevenLabs (eleven_multilingual_v2)' })
  @ApiProduces('audio/mpeg')
  @ApiResponse({ status: 200, description: 'Streams audio/mpeg back to client' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 503, description: 'ElevenLabs API unavailable' })
  async synthesize(
    @Body() dto: SynthesizeDto,
    @Res() res: Response,
  ) {
    const { stream, contentType } = await this.speech.synthesize(dto.text, dto.language);

    res.set({
      'Content-Type': contentType,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    });

    // Convert web ReadableStream to Node Readable and pipe to Express response
    const nodeStream = Readable.fromWeb(stream as import('stream/web').ReadableStream);
    nodeStream.pipe(res);
  }
}
