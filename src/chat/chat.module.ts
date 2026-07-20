import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { OpenAIChatService } from './openai-chat.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { CoachingItemsModule } from '../coaching-items/coaching-items.module';

@Module({
  imports: [EmbeddingModule, CoachingItemsModule],
  controllers: [ChatController],
  providers: [ChatService, OpenAIChatService],
})
export class ChatModule {}
