import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// QueueModule requires Redis — only import when available
const hasRedis = !!process.env.REDIS_URL || !!process.env.REDIS_HOST;
let QueueModuleRef: any = [];
if (hasRedis) {
  // Dynamic import to avoid loading BullModule when Redis is absent
  const { QueueModule } = require('../queue/queue.module');
  QueueModuleRef = [QueueModule];
}

@Module({
  imports: [ConfigModule, ...QueueModuleRef],
  providers: [AdminController, AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
