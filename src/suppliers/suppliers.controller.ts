import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierPaymentDto } from './dto/supplier-payment.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

/** Ta'minotchilar va ularga qarz — faqat ADMIN */
@Roles(Role.ADMIN, Role.SUPERADMIN)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Query('search') search?: string, @Query('debtors') debtors?: string) {
    return this.suppliers.list(search, debtors === 'true');
  }

  @Get('summary')
  summary() {
    return this.suppliers.summary();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.suppliers.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.suppliers.remove(id);
  }

  @Post(':id/payments')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SupplierPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliers.recordPayment(id, dto, user.id);
  }
}
