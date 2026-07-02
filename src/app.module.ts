import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantContextMiddleware } from './common/tenant-context.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SalesModule } from './sales/sales.module';
import { AuthModule } from './auth/auth.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { PacketsModule } from './packets/packets.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ExpensesModule } from './expenses/expenses.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ProductsModule,
    InventoryModule,
    NotificationsModule,
    SalesModule,
    SuperadminModule,
    PacketsModule,
    CustomersModule,
    SuppliersModule,
    ShiftsModule,
    ExpensesModule,
    TelegramModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Har bir so'rovga apteka kontekstini o'rnatadi (tenant izolyatsiyasi uchun)
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
