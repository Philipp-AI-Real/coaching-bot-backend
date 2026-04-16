import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { GeminiChatService } from './gemini-chat.service';
import { OpenAIChatService } from './openai-chat.service';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [EmbeddingModule],
  controllers: [ChatController],
  // GeminiChatService kept registered for reference; ChatService now uses OpenAI.
  providers: [ChatService, OpenAIChatService, GeminiChatService],
})
export class ChatModule {}
