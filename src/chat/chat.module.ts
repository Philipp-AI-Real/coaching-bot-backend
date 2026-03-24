import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { GeminiChatService } from './gemini-chat.service';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [EmbeddingModule],
  controllers: [ChatController],
  providers: [ChatService, GeminiChatService],
})
export class ChatModule {}
