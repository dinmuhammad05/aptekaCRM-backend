/* Prisma client extension tabiatan dinamik (args/query tiplari runtime'da) —
   shu fayl uchun "unsafe any" qoidalari yumshatiladi. */

/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Prisma } from '@prisma/client';
import { getTenant } from '../common/tenant-context';

/**
 * Multi-tenant izolyatsiya yadrosi — Prisma Client Extension.
 *
 * Har bir so'rovga joriy aptekaning (`pharmacyId`) filtrini AVTOMATIK qo'shadi,
 * shuning uchun bir apteka boshqasining ma'lumotini hech qachon ko'rmaydi. Bu
 * bitta majburiy "choke point" — service kodida qo'lda yozish shart emas va uni
 * unutib bo'lmaydi.
 *
 *  - SUPERADMIN (SaaS egasi) va tizim amallari (login, seed, boot) filtrlanmaydi.
 *  - ADMIN/CASHIER uchun `pharmacyId` noma'lum bo'lsa, xavfsizlik yuzasidan `-1`
 *    ishlatiladi (hech qanday qator ko'rinmaydi).
 *
 * Eslatma: Prisma 6 da `$use` middleware olib tashlangan; shu sabab client
 * extension ishlatiladi. Kelajakda DB darajasidagi Postgres RLS bilan ham
 * mustahkamlash mumkin (himoyaning ikkinchi qatlami).
 */

/** `pharmacyId` ustuniga ega modellar (to'g'ridan-to'g'ri filtr). */
const COLUMN_MODELS = new Set<string>([
  'Product',
  'Batch',
  'Sale',
  'Return',
  'Notification',
  'User',
  'Customer',
  'CustomerPayment',
  'Shift',
]);

/** Bog'lanish (relation) orqali scope qilinadigan modellar (faqat o'qish). */
const RELATION_SCOPE: Record<
  string,
  (pharmacyId: number) => Record<string, unknown>
> = {
  // SaleItem o'z ustuniga ega emas — chek (Sale) orqali apteka aniqlanadi
  SaleItem: (pharmacyId) => ({ sale: { pharmacyId } }),
  // ReturnItem — chek qatori → chek orqali
  ReturnItem: (pharmacyId) => ({ saleItem: { sale: { pharmacyId } } }),
};

/** Mavjud `where` ni buzmasdan filtrni AND bilan qo'shadi. */
function andWhere(
  existing: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return extra;
  return { AND: [existing, extra] };
}

export const tenantExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const ctx = getTenant();
          const role = ctx?.role;

          // Faqat apteka foydalanuvchilari (ADMIN/CASHIER) filtrlanadi.
          if (role !== 'ADMIN' && role !== 'CASHIER') {
            return query(args);
          }

          const pharmacyId = ctx?.pharmacyId ?? -1;
          const isColumn = COLUMN_MODELS.has(model);
          const relFn = RELATION_SCOPE[model];
          if (!isColumn && !relFn) return query(args);

          const scope = isColumn ? { pharmacyId } : relFn(pharmacyId);

          switch (operation) {
            // findUnique faqat unique `where` qabul qiladi — natijani keyin filtrlaymiz
            case 'findUnique':
            case 'findUniqueOrThrow': {
              const result = await query(args);
              if (result == null) return result;
              const ok = isColumn
                ? (result as { pharmacyId?: number }).pharmacyId === pharmacyId
                : true; // relation modellarda findUnique ishlatilmaydi
              if (!ok) {
                if (operation === 'findUniqueOrThrow') {
                  throw new Error('Yozuv topilmadi');
                }
                return null;
              }
              return result;
            }

            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
            case 'updateMany':
            case 'deleteMany':
              return query({
                ...args,
                where: andWhere(args?.where, scope),
              });

            // extendedWhereUnique: unique (id) yonida pharmacyId beriladi
            case 'update':
            case 'delete':
              return query({
                ...args,
                where: { ...(args?.where ?? {}), ...scope },
              });

            case 'upsert':
              return query({
                ...args,
                where: { ...(args?.where ?? {}), ...scope },
                create: isColumn
                  ? { ...args?.create, pharmacyId }
                  : args?.create,
              });

            case 'create':
              if (isColumn) {
                return query({
                  ...args,
                  data: { ...args?.data, pharmacyId },
                });
              }
              return query(args);

            case 'createMany':
              if (isColumn && args?.data) {
                return query({
                  ...args,
                  data: Array.isArray(args.data)
                    ? args.data.map((d: Record<string, unknown>) => ({
                        ...d,
                        pharmacyId,
                      }))
                    : { ...args.data, pharmacyId },
                });
              }
              return query(args);

            default:
              return query(args);
          }
        },
      },
    },
  }),
);
