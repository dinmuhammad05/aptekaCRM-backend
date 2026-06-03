import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.list(limit);
  }

  @Patch('read-all')
  markAllRead() {
    return this.notificationsService.markAllRead();
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.markRead(id);
  }
}
