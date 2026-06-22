import { Module } from '@nestjs/common';
import { PacketsAdminController } from './packets.admin.controller';
import { PacketsController } from './packets.controller';
import { PacketsService } from './packets.service';

@Module({
  controllers: [PacketsAdminController, PacketsController],
  providers: [PacketsService],
})
export class PacketsModule {}
