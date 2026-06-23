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
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { CloseShiftDto } from './dto/close-shift.dto';
import { OpenShiftDto } from './dto/open-shift.dto';
import { ShiftsService } from './shifts.service';

/** Kassir smenasi va kassa hisoboti — ADMIN/CASHIER */
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.shifts.current(user.id);
  }

  @Post('open')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenShiftDto) {
    return this.shifts.open(user.id, dto);
  }

  @Post(':id/close')
  close(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CloseShiftDto,
  ) {
    return this.shifts.close(id, user.id, dto);
  }

  @Get()
  list(@Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number) {
    return this.shifts.list(limit);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.shifts.getOne(id);
  }
}
