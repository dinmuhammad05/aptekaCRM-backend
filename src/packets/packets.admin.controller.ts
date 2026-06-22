import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreatePacketDto, UpdatePacketDto } from './dto/packet.dto';
import {
  ImportPacketItemsDto,
  UpdatePacketItemDto,
} from './dto/packet-item.dto';
import { PacketsService } from './packets.service';

/** SUPERADMIN — tayyor packetlarni (shablon kataloglarni) boshqarish */
@Controller('superadmin/packets')
@Roles(Role.SUPERADMIN)
export class PacketsAdminController {
  constructor(private readonly packets: PacketsService) {}

  @Get()
  list() {
    return this.packets.listPackets();
  }

  @Post()
  create(@Body() dto: CreatePacketDto) {
    return this.packets.createPacket(dto);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.packets.getPacket(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePacketDto,
  ) {
    return this.packets.updatePacket(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.packets.deletePacket(id);
  }

  /** Packetga dorilarni ommaviy qo'shish (Exceldan) */
  @Post(':id/items')
  addItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ImportPacketItemsDto,
  ) {
    return this.packets.addItems(id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdatePacketItemDto,
  ) {
    return this.packets.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  deleteItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.packets.deleteItem(id, itemId);
  }

  /** Barcha dorilar qoldig'ini 0 ga aylantirish */
  @Post(':id/zero-quantities')
  zeroQuantities(@Param('id', ParseIntPipe) id: number) {
    return this.packets.zeroQuantities(id);
  }
}
