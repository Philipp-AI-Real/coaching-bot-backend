import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

// PrismaService is provided globally (PrismaModule is @Global), so this module
// only declares its own controller + service.
@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
