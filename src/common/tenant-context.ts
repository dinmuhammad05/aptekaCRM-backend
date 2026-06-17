import { ForbiddenException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Multi-tenant kontekst — har bir so'rov uchun joriy apteka (tenant) va rol.
 *
 * AsyncLocalStorage so'rov boshida (TenantContextMiddleware) to'ldiriladi va
 * butun so'rov davomida (controller → service → Prisma) o'qiladi. Prisma
 * middleware (`tenant-scope.ts`) shu yerdan `pharmacyId` ni olib, har bir
 * so'rovga avtomatik filtr qo'shadi — hech bir joyda qo'lda yozilmaydi.
 */
export interface TenantStore {
  /** Joriy apteka IDsi. SUPERADMIN uchun null/undefined (filtr qo'llanmaydi). */
  pharmacyId?: number | null;
  /** Joriy foydalanuvchi roli. */
  role?: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
  /** Joriy foydalanuvchi IDsi. */
  userId?: number;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Joriy tenant kontekstini qaytaradi (kontekst bo'lmasa undefined). */
export function getTenant(): TenantStore | undefined {
  return tenantStorage.getStore();
}

/**
 * Joriy aptekaning IDsini qaytaradi (yangi yozuv yaratishda kerak).
 * Kontekst bo'lmasa — bu invariant buzilishi, xato qaytariladi.
 */
export function requirePharmacyId(): number {
  const ctx = tenantStorage.getStore();
  if (ctx?.pharmacyId == null) {
    throw new ForbiddenException('Apteka konteksti aniqlanmadi');
  }
  return ctx.pharmacyId;
}
