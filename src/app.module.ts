import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { PrismaModule } from './prisma/prisma.module';
import { QdrantModule } from './qdrant/qdrant.module';

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
    ChatModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
