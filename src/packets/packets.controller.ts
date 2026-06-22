import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PacketsService } from './packets.service';

/** APTEKA ADMINI — mavjud packetni ko'rish va o'ziga klonlash */
@Controller('packets')
@Roles(Role.ADMIN)
export class PacketsController {
  constructor(private readonly packets: PacketsService) {}

  /** Tanlash uchun mavjud packetlar ro'yxati */
  @Get()
  list() {
    return this.packets.listAvailable();
  }

  /** Packetni joriy aptekaga klonlash (qoldiq 0 dan) */
  @Post(':id/apply')
  apply(@Param('id', ParseIntPipe) id: number) {
    return this.packets.applyToPharmacy(id);
  }
}
