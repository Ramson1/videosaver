import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [ConfigModule, QueueModule],
  providers: [AdminController, AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
