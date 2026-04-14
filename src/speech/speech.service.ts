import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(private readonly config: ConfigService) {}

  // ─── Transcribe (OpenAI Whisper) ───────────────────────────────────────────

  async transcribe(
    file: Express.Multer.File,
    language: string,
  ): Promise<{ text: string }> {
    if (!file) {
      throw new BadRequestException('Audio file is required');
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    formData.append('model', 'whisper-1');
    formData.append('language', language === 'de' ? 'de' : 'en');

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Whisper API request failed: ${msg}`);
      throw new ServiceUnavailableException('Speech transcription service unavailable');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      this.logger.error(`Whisper API ${response.status}: ${body}`);
      throw new ServiceUnavailableException(
        `Speech transcription failed (${response.status})`,
      );
    }

    const data = (await response.json()) as { text?: string };
    return { text: data.text ?? '' };
  }

  // ─── Synthesize (ElevenLabs) ───────────────────────────────────────────────

  async synthesize(
    text: string,
    language: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string }> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('ELEVENLABS_API_KEY is not configured');
    }

    const voiceId =
      language === 'de'
        ? this.config.get<string>('ELEVENLABS_VOICE_ID_DE')
        : this.config.get<string>('ELEVENLABS_VOICE_ID_EN');

    if (!voiceId) {
      throw new ServiceUnavailableException(
        `ELEVENLABS_VOICE_ID_${language === 'de' ? 'DE' : 'EN'} is not configured`,
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`ElevenLabs API request failed: ${msg}`);
      throw new ServiceUnavailableException('Speech synthesis service unavailable');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      this.logger.error(`ElevenLabs API ${response.status}: ${body}`);
      throw new ServiceUnavailableException(
        `Speech synthesis failed (${response.status})`,
      );
    }

    if (!response.body) {
      throw new ServiceUnavailableException('ElevenLabs returned empty stream');
    }

    return {
      stream: response.body as ReadableStream<Uint8Array>,
      contentType: response.headers.get('content-type') ?? 'audio/mpeg',
    };
  }
}
