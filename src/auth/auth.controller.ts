import { Body, Controller, Get, Post } from '@nestjs/common';
import { AllowBlocked } from './allow-blocked.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Bloklangan apteka foydalanuvchisi ham o'z holatini ko'ra olishi kerak
  @AllowBlocked()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }
}
