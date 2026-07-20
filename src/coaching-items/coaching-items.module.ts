import { Module } from '@nestjs/common';
import { CoachingItemsController } from './coaching-items.controller';
import { CoachingItemsService } from './coaching-items.service';

// PrismaService is provided globally (PrismaModule is @Global), so this module
// only declares its own controller + service. CoachingItemsService is exported
// so ChatModule can inject it to load open items into the system prompt.
@Module({
  controllers: [CoachingItemsController],
  providers: [CoachingItemsService],
  exports: [CoachingItemsService],
})
export class CoachingItemsModule {}
