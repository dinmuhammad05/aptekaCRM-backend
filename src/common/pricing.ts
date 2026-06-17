import { Prisma } from '@prisma/client';

/**
 * Dona (bitta tabletka) narxini hisoblaydi: pachka narxi / pachkadagi dona soni.
 * Butun so'mga DOIM yuqoriga (ceil) yaxlitlanadi — apteka foydasiga, hech qachon
 * zarar yo'q. unitsPerPack <= 1 bo'lsa pachka narxining o'zi qaytadi.
 */
export function computePiecePrice(
  packPrice: Prisma.Decimal,
  unitsPerPack: number,
): Prisma.Decimal {
  if (unitsPerPack <= 1) {
    return packPrice;
  }
  return packPrice
    .div(unitsPerPack)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_UP);
}
