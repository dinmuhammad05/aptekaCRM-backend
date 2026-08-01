import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ImportStockDto } from './dto/import-stock.dto';
import { InitialStockDto } from './dto/initial-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
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

  /** Boshlang'ich qoldiq — dori kartasiga barcode + bitta partiya (faqat admin) */
  @Post('initial-stock')
  @Roles(Role.ADMIN)
  initialStock(@Body() dto: InitialStockDto) {
    return this.inventoryService.initialStock(dto);
  }

  @Post('adjust')
  @Roles(Role.ADMIN)
  adjust(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto);
  }

  
  @Get('recent-batches')
  recentBatches() {
    return this.inventoryService.recentBatches();
  }

  @Get('stock')
  stock() {
    return this.inventoryService.stock();
  }

  @Get('stock-paginated')
  stockPaginated(
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('search') search?: string,
  ) {
    return this.inventoryService.stockPaginated(search, take, skip);
  }

  @Get('low-stock')
  lowStock() {
    return this.inventoryService.lowStock();
  }

  @Get('expiring')
  expiringSoon(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.inventoryService.expiringSoon(days);
  }

  @Patch('batch/:id')
  updateBatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.inventoryService.updateBatch(id, dto);
  }

  @Delete('batch/:id')
  @Roles(Role.ADMIN)
  deleteBatch(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.deleteBatch(id);
  }
}
