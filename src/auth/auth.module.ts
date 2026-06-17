import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { SubscriptionGuard } from './subscription.guard';

@Module({
  imports: [
    // global: butun ilova (jumladan tenant middleware) JwtService'dan foydalanadi
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'apteka-dev-secret-change-me',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Global guardlar tartibi: JWT (req.user) → rol → obuna/blok nazorati
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AuthModule {}
