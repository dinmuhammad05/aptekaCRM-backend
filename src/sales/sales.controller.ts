import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ReturnSaleDto } from './dto/return-sale.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.salesService.create(dto, user.id);
  }

  @Post(':id/return')
  returnSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnSaleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesService.returnSale(id, dto, user.id);
  }

  @Get()
  findAll(
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.salesService.findAll(take, skip, from, to);
  }

  @Get('stats')
  @Roles(Role.ADMIN)
  stats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.salesService.stats(from, to);
  }

  @Get('top')
  @Roles(Role.ADMIN)
  top(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.salesService.top(from, to, limit);
  }

  @Get('daily')
  @Roles(Role.ADMIN)
  daily(@Query('from') from?: string, @Query('to') to?: string) {
    return this.salesService.daily(from, to);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findOne(id);
  }
}
