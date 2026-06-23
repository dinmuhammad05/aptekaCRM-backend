import { Prisma, SaleUnit } from '@prisma/client';
import { computePiecePrice } from './pricing';

/**
 * Sotuv statistikasi (savdo/tannarx/foyda) hisobining yagona manbasi.
 * `sales` va `superadmin` modullari shu yerdan foydalanadi — tannarx/foyda
 * formulasi ikki joyda ajralib qolmasligi uchun (CLAUDE.md: pricing markazda).
 */

export interface StatSaleItem {
  unit: SaleUnit;
  quantity: number;
  batch: { costPrice: Prisma.Decimal };
  product: { unitsPerPack: number };
}

export interface StatSale {
  total: Prisma.Decimal;
  items: StatSaleItem[];
}

/** Bitta sotuv qatori uchun donadagi tannarx (PACK/PIECE) */
export function saleItemUnitCost(item: StatSaleItem): Prisma.Decimal {
  return item.unit === SaleUnit.PACK
    ? item.batch.costPrice
    : computePiecePrice(item.batch.costPrice, item.product.unitsPerPack);
}

/** Umumiy ko'rsatkichlar: savdo, tannarx, foyda, sotuvlar soni, sotilgan dona */
export function computeSalesStats(sales: StatSale[]) {
  let revenue = new Prisma.Decimal(0);
  let cost = new Prisma.Decimal(0);
  let itemsSold = 0;
  for (const sale of sales) {
    revenue = revenue.add(sale.total);
    for (const item of sale.items) {
      cost = cost.add(saleItemUnitCost(item).mul(item.quantity));
      itemsSold +=
        item.unit === SaleUnit.PACK
          ? item.quantity * item.product.unitsPerPack
          : item.quantity;
    }
  }
  return {
    revenue: revenue.toFixed(2),
    cost: cost.toFixed(2),
    profit: revenue.sub(cost).toFixed(2),
    salesCount: sales.length,
    itemsSold,
  };
}
