import { Global, Module } from '@nestjs/common';
import { CpmProcessService } from './cpm-process.service';

/**
 * Read-only access to the CPM serving Postgres for the chatbot's process tools.
 * Global so the chat layer can inject CpmProcessService without re-importing,
 * mirroring QdrantModule / PrismaModule.
 */
@Global()
@Module({
  providers: [CpmProcessService],
  exports: [CpmProcessService],
})
export class CpmProcessModule {}
