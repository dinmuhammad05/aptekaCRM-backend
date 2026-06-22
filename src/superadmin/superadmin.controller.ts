import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreatePharmacyDto } from './dto/create-pharmacy.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';
import { SuperadminService } from './superadmin.service';

/** SaaS egasi (SUPERADMIN) uchun — aptekalar va obunalarni boshqarish */
@Controller('superadmin')
@Roles(Role.SUPERADMIN)
export class SuperadminController {
  constructor(private readonly superadmin: SuperadminService) {}

  @Get('dashboard')
  dashboard() {
    return this.superadmin.dashboard();
  }

  @Get('pharmacies')
  listPharmacies() {
    return this.superadmin.listPharmacies();
  }

  @Post('pharmacies')
  createPharmacy(@Body() dto: CreatePharmacyDto) {
    return this.superadmin.createPharmacy(dto);
  }

  @Patch('pharmacies/:id')
  updatePharmacy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePharmacyDto,
  ) {
    return this.superadmin.updatePharmacy(id, dto);
  }

  @Patch('pharmacies/:id/block')
  block(@Param('id', ParseIntPipe) id: number) {
    return this.superadmin.setStatus(id, 'BLOCKED');
  }

  @Patch('pharmacies/:id/activate')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.superadmin.setStatus(id, 'ACTIVE');
  }

  /** Obunani N oyga uzaytirish (1/2/3 oy tugmalari) */
  @Post('pharmacies/:id/extend')
  extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendSubscriptionDto,
  ) {
    return this.superadmin.extendSubscription(id, dto.months);
  }

  /** SaaS obuna daromadi statistikasi */
  @Get('revenue')
  revenue() {
    return this.superadmin.revenueStats();
  }

  /** Aptekalar savdosi (aylanma) statistikasi */
  @Get('sales-overview')
  salesOverview() {
    return this.superadmin.salesOverview();
  }

  @Get('notifications')
  notifications(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.superadmin.listNotifications(limit);
  }

  @Patch('notifications/read-all')
  markAllRead() {
    return this.superadmin.markAllNotificationsRead();
  }

  @Patch('notifications/:id/read')
  markRead(@Param('id', ParseIntPipe) id: number) {
    return this.superadmin.markNotificationRead(id);
  }
}
