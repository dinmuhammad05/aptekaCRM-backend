import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramScheduler } from './telegram.scheduler';
import { TelegramService } from './telegram.service';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, TelegramScheduler],
  exports: [TelegramService],
})
export class TelegramModule {}
