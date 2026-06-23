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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerPaymentDto } from './dto/customer-payment.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/** Mijozlar va nasiya (qarz) — ADMIN/CASHIER ishlatadi */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('debtors') debtors?: string,
  ) {
    return this.customers.list(search, debtors === 'true');
  }

  @Get('summary')
  summary() {
    return this.customers.summary();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.customers.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(id, dto);
  }

  // O'chirish — faqat ADMIN (qarzsiz mijoz)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.customers.remove(id);
  }

  @Post(':id/payments')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CustomerPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.recordPayment(id, dto, user.id);
  }
}
