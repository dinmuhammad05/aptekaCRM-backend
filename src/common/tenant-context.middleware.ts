import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { tenantStorage, type TenantStore } from './tenant-context';

/**
 * Har bir so'rovda JWT'dan apteka kontekstini (`pharmacyId`, `role`) o'qib,
 * AsyncLocalStorage'ga joylaydi. Shu kontekst butun so'rov davomida
 * (controller → service → Prisma) mavjud bo'ladi va Prisma middleware
 * undan foydalanib avtomatik tenant filtrini qo'shadi.
 *
 * Bu middleware guard'lardan oldin ishlaydi, shuning uchun tokenni o'zi
 * optimistik o'qiydi (verifikatsiyani JwtAuthGuard yakuniy hal qiladi).
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const store: TenantStore = {};

    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<{
          sub: number;
          role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
          pharmacyId: number | null;
        }>(header.slice(7));
        store.userId = payload.sub;
        store.role = payload.role;
        store.pharmacyId = payload.pharmacyId ?? null;
      } catch {
        // Yaroqsiz token — kontekst bo'sh qoladi, JwtAuthGuard rad etadi
      }
    }

    // Muhim: har bir so'rov uchun yangi context (run) ochib, ichida enterWith
    // bilan store o'rnatamiz. `next()` ni await qilib bo'lmagani uchun, oddiy
    // `run(store, () => next())` Prisma'ning kechiktirilgan (async) chaqiruvida
    // kontekstni yo'qotadi — `enterWith` esa store'ni butun so'rov zanjiriga
    // (jumladan deferred Prisma so'rovlariga) yopishtiradi.
    tenantStorage.run({}, () => {
      tenantStorage.enterWith(store);
      next();
    });
  }
}
