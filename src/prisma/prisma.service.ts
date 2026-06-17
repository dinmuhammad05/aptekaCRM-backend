/* Proxy orqali kengaytirilgan mijozga yo'naltirish dinamik (prop tiplari
   runtime'da aniqlanadi) — shu fayl uchun "unsafe any" qoidalari yumshatiladi. */

/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantExtension } from './tenant-scope';

/**
 * Prisma mijozini Nest hayot sikliga bog'laydi:
 * modul yuklanganda ulanadi, to'xtaganda uzadi.
 *
 * Multi-tenant: barcha so'rovlar `tenantExtension` (client extension) orqali
 * o'tadi — har bir so'rovga joriy aptekaning (`pharmacyId`) filtri avtomatik
 * qo'shiladi (izolyatsiya yadrosi, `tenant-scope.ts`).
 *
 * Texnik eslatma: `$extends` yangi (kengaytirilgan) mijoz qaytaradi. Service'lar
 * `PrismaService` ni o'zgarmagan holda ishlatishi uchun, model va so'rov
 * chaqiruvlari Proxy orqali kengaytirilgan mijozga yo'naltiriladi; ulanish va
 * hayot sikli metodlari esa asosiy mijozda qoladi.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    const extended = this.$extends(tenantExtension);

    return new Proxy(this, {
      get(target, prop) {
        // Hayot sikli metodlari asosiy mijozga bog'lanadi (ulanish + logger shu yerda)
        if (prop === 'onModuleInit' || prop === 'onModuleDestroy') {
          const fn = Reflect.get(target, prop, target) as unknown;
          return typeof fn === 'function' ? fn.bind(target) : fn;
        }
        // Qolgan hammasi (modellar, $transaction, $queryRaw, ...) — kengaytirilgan mijozdan

        const value = (extended as any)[prop];
        if (typeof value === 'function') {
          return value.bind(extended);
        }

        return value;
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Ma'lumotlar bazasiga ulanildi");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Ma'lumotlar bazasi ulanishi uzildi");
  }
}
