import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ImportStockDto } from './dto/import-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('receive')
  receive(@Body() dto: ReceiveStockDto) {
    return this.inventoryService.receive(dto);
  }

  @Post('import')
  importStock(@Body() dto: ImportStockDto) {
    return this.inventoryService.importStock(dto);
  }

  @Get('stock')
  stock() {
    return this.inventoryService.stock();
  }

  @Get('expiring')
  expiringSoon(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.inventoryService.expiringSoon(days);
  }
}
