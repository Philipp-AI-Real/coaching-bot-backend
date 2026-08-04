import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CoachingItemsModule } from './coaching-items/coaching-items.module';
import { CpmProcessModule } from './cpm-process/cpm-process.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { PrismaModule } from './prisma/prisma.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { SpeechModule } from './speech/speech.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AuthModule,
    QdrantModule,
    KnowledgeBaseModule,
    AdminUsersModule,
    CoachingItemsModule,
    CpmProcessModule,
    ChatModule,
    SpeechModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
