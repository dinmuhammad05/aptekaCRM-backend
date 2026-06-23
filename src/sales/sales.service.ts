import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SaleUnit } from '@prisma/client';
import { computePiecePrice } from '../common/pricing';
import { startOfDay, endOfDay } from '../common/date';
import { computeSalesStats } from '../common/sales-stats';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto, DiscountType } from './dto/create-sale.dto';
import { ReturnSaleDto } from './dto/return-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sotuvni amalga oshiradi. Bir tranzaksiya ichida:
   *  - har bir mahsulot uchun FEFO (muddati eng yaqin partiyadan) qoldiqni kamaytiradi
   *  - chek (Sale) va qatorlarni (SaleItem) yozadi
   * Qoldiq yetmasa — butun tranzaksiya bekor qilinadi.
   */
  async create(dto: CreateSaleDto, userId?: number) {
    const pharmacyId = requirePharmacyId();
    // Muddati o'tgan dorini sotib bo'lmaydi: bugundan oldingi partiyalar hisobga
    // olinmaydi (sana bo'yicha, vaqtsiz)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sale = await this.prisma.$transaction(async (tx) => {
      const saleItemsData: Prisma.SaleItemCreateManySaleInput[] = [];
      let subtotal = new Prisma.Decimal(0);

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new NotFoundException(`Dori topilmadi (id=${item.productId})`);
        }

        // Sotilgan birlikni donaga o'tkazamiz: PACK bo'lsa pachkadagi
        // dona soniga ko'paytiramiz, PIECE bo'lsa o'zicha qoladi.
        const pieces =
          item.unit === SaleUnit.PACK
            ? item.quantity * product.unitsPerPack
            : item.quantity;

        // FEFO: muddati eng yaqin partiyalar birinchi. Muddati o'tganlari
        // (expiryDate < bugun) sotuvga umuman kiritilmaydi.
        const batches = await tx.batch.findMany({
          where: {
            productId: item.productId,
            quantity: { gt: 0 },
            expiryDate: { gte: today },
          },
          orderBy: { expiryDate: 'asc' },
        });

        // Qoldiq tekshiruvi donada (faqat muddati o'tmagan partiyalar)
        const availablePieces = batches.reduce((sum, b) => sum + b.quantity, 0);
        if (availablePieces < pieces) {
          const unitLabel = item.unit === SaleUnit.PACK ? 'pachka' : 'dona';
          throw new BadRequestException(
            `"${product.name}" uchun yaroqli qoldiq yetarli emas (mavjud: ${availablePieces} dona, kerak: ${item.quantity} ${unitLabel}). Muddati o'tgan partiyalar sotilmaydi.`,
          );
        }

        // Narx skanerlangandagidek — eng yaqin muddatli (front) partiyadan.
        // PACK → pachka narxi; PIECE → dona narxi (avtomatik, yaxlit).
        const frontBatch = batches[0];
        const unitPrice =
          item.unit === SaleUnit.PACK
            ? frontBatch.sellPrice
            : computePiecePrice(frontBatch.sellPrice, product.unitsPerPack);
        const lineSubtotal = unitPrice.mul(item.quantity);
        subtotal = subtotal.add(lineSubtotal);

        // Qoldiqni FEFO bo'yicha donada kamaytiramiz (bir nechta partiyaga
        // tushishi mumkin), lekin chekka bitta SaleItem yoziladi.
        let remaining = pieces;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.quantity, remaining);
          await tx.batch.update({
            where: { id: batch.id },
            data: { quantity: { decrement: take } },
          });
          remaining -= take;
        }

        saleItemsData.push({
          productId: product.id,
          batchId: frontBatch.id,
          unit: item.unit,
          quantity: item.quantity,
          price: unitPrice,
          subtotal: lineSubtotal,
        });
      }

      // Chegirmani qo'llaymiz: foiz yoki summa. Natija [0, subtotal] oralig'ida
      // chegaralanadi va butun so'mga yaxlitlanadi.
      const discount = this.computeDiscount(
        subtotal,
        dto.discountType,
        dto.discountValue,
      );
      const total = subtotal.sub(discount);

      // Nasiya (qarz): mijoz tanlangan bo'lsa, to'langan summa [0, total] ga
      // chegaralanadi va qoldiq (total - paid) mijoz qarziga qo'shiladi.
      // Mijozsiz savdo — to'liq to'langan deb hisoblanadi (paid = total).
      let customerId: number | null = null;
      let paid = total;
      if (dto.customerId != null) {
        const customer = await tx.customer.findFirst({
          where: { id: dto.customerId },
        });
        if (!customer) {
          throw new NotFoundException('Mijoz topilmadi');
        }
        customerId = customer.id;
        paid = Prisma.Decimal.min(
          total,
          Prisma.Decimal.max(0, new Prisma.Decimal(dto.paid ?? 0)),
        );
        const debtDelta = total.sub(paid);
        if (debtDelta.gt(0)) {
          await tx.customer.update({
            where: { id: customer.id },
            data: { debt: { increment: debtDelta } },
          });
        }
      }

      // Kassirning ochiq smenasi bo'lsa, sotuv unga bog'lanadi (kassa hisoboti).
      let shiftId: number | null = null;
      if (userId != null) {
        const openShift = await tx.shift.findFirst({
          where: { userId, status: 'OPEN' },
          select: { id: true },
        });
        shiftId = openShift?.id ?? null;
      }

      return tx.sale.create({
        data: {
          pharmacyId,
          subtotal,
          discount,
          total,
          paid,
          customerId,
          shiftId,
          paymentType: dto.paymentType,
          userId,
          items: { createMany: { data: saleItemsData } },
        },
        include: { items: true },
      });
    });

    // Sotuvdan keyin kam qolgan dorilar uchun ogohlantirish (sotuvni bloklamaydi)
    await this.notifyLowStock(
      dto.items.map((i) => i.productId),
      pharmacyId,
    );

    return sale;
  }

  /**
   * Sotilgan dorilardan chegaradan past tushganlari uchun LOW_STOCK
   * bildirishnomasi yaratadi (kassir/admin uchun). Spam bo'lmasligi uchun
   * shu dori bo'yicha o'qilmagan ogohlantirish bo'lsa, takror yaratilmaydi.
   */
  private async notifyLowStock(productIds: number[], pharmacyId: number) {
    try {
      const ids = [...new Set(productIds)];
      if (ids.length === 0) return;
      const products = await this.prisma.product.findMany({
        where: { id: { in: ids }, minStock: { gt: 0 } },
        select: {
          id: true,
          name: true,
          minStock: true,
          batches: {
            where: { quantity: { gt: 0 } },
            select: { quantity: true },
          },
        },
      });
      const low = products.filter(
        (p) => p.batches.reduce((s, b) => s + b.quantity, 0) <= p.minStock,
      );
      if (low.length === 0) return;

      const existing = await this.prisma.notification.findMany({
        where: {
          type: 'LOW_STOCK',
          read: false,
          productId: { in: low.map((p) => p.id) },
        },
        select: { productId: true },
      });
      const alreadyNotified = new Set(existing.map((e) => e.productId));
      const toCreate = low.filter((p) => !alreadyNotified.has(p.id));
      if (toCreate.length === 0) return;

      await this.prisma.notification.createMany({
        data: toCreate.map((p) => ({
          pharmacyId,
          type: 'LOW_STOCK',
          productId: p.id,
          productName: p.name,
        })),
      });
    } catch {
      // Bildirishnoma xatosi sotuvni buzmasligi kerak
    }
  }

  /** Chegirma summasini hisoblaydi (so'mda), [0, subtotal] ga chegaralangan */
  private computeDiscount(
    subtotal: Prisma.Decimal,
    discountType?: DiscountType,
    discountValue?: number,
  ): Prisma.Decimal {
    if (!discountType || !discountValue || discountValue <= 0) {
      return new Prisma.Decimal(0);
    }

    let discount =
      discountType === 'PERCENT'
        ? subtotal.mul(discountValue).div(100)
        : new Prisma.Decimal(discountValue);

    discount = discount.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

    if (discount.gt(subtotal)) {
      return subtotal;
    }
    return discount;
  }

  /**
   * Sotuvlar tarixi (eng yangisi birinchi), sahifalangan.
   * Tarix vaqt o'tib cheksiz o'sgani uchun limit majburiy: standart 50,
   * maksimal 200 (butun jadvalni bir so'rovda yuklab olishning oldini oladi).
   */
  findAll(take = 50, skip = 0, from?: string, to?: string) {
    // Sana filteri ixtiyoriy: from/to berilsa createdAt bo'yicha cheklaymiz
    const where: Prisma.SaleWhereInput = {};
    if (from || to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (from) {
        const start = new Date(from);
        start.setHours(0, 0, 0, 0);
        createdAt.gte = start;
      }
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }
    return this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
      skip: Math.max(skip, 0),
      include: { items: { include: { product: true } } },
    });
  }

  async findOne(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: { include: { product: true, batch: true } } },
    });
    if (!sale) {
      throw new NotFoundException(`Chek topilmadi (id=${id})`);
    }
    return sale;
  }

  /**
   * Sotuvni (qisman yoki to'liq) qaytaradi. Bir tranzaksiyada:
   *  - har qator uchun qaytarish mumkin bo'lgan miqdordan oshmasligini tekshiradi
   *    (sotilgan − allaqachon qaytarilgan),
   *  - qoldiqni asl partiyaga (donada) qaytaradi,
   *  - Return + ReturnItem yozuvlarini yaratadi.
   */
  async returnSale(saleId: number, dto: ReturnSaleDto, userId?: number) {
    const pharmacyId = requirePharmacyId();
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: { include: { product: true } } },
      });
      if (!sale) {
        throw new NotFoundException(`Chek topilmadi (id=${saleId})`);
      }

      const returnItemsData: {
        saleItemId: number;
        quantity: number;
        subtotal: Prisma.Decimal;
      }[] = [];
      let total = new Prisma.Decimal(0);

      for (const reqItem of dto.items) {
        const saleItem = sale.items.find((si) => si.id === reqItem.saleItemId);
        if (!saleItem) {
          throw new BadRequestException(
            `Chek qatori topilmadi (id=${reqItem.saleItemId})`,
          );
        }

        // Avval qaytarilgan miqdor
        const agg = await tx.returnItem.aggregate({
          where: { saleItemId: saleItem.id },
          _sum: { quantity: true },
        });
        const alreadyReturned = agg._sum.quantity ?? 0;
        const remaining = saleItem.quantity - alreadyReturned;
        if (reqItem.quantity > remaining) {
          throw new BadRequestException(
            `"${saleItem.product.name}" uchun qaytarish miqdori ortiqcha (mumkin: ${remaining})`,
          );
        }

        // Qoldiqni asl partiyaga donada qaytaramiz
        const pieces =
          saleItem.unit === SaleUnit.PACK
            ? reqItem.quantity * saleItem.product.unitsPerPack
            : reqItem.quantity;
        await tx.batch.update({
          where: { id: saleItem.batchId },
          data: { quantity: { increment: pieces } },
        });

        const subtotal = saleItem.price.mul(reqItem.quantity);
        total = total.add(subtotal);
        returnItemsData.push({
          saleItemId: saleItem.id,
          quantity: reqItem.quantity,
          subtotal,
        });
      }

      return tx.return.create({
        data: {
          pharmacyId,
          saleId,
          userId,
          total,
          items: { createMany: { data: returnItemsData } },
        },
        include: { items: true },
      });
    });
  }

  /** Hisobot sana oralig'i: standart — joriy oy boshi..bugun */
  private parseRange(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date();
    if (!from) start.setDate(1);
    const end = to ? new Date(to) : new Date();
    return { start: startOfDay(start), end: endOfDay(end) };
  }

  /** Umumiy ko'rsatkichlar: savdo, tannarx, foyda, sotuvlar soni, sotilgan dona */
  async stats(from?: string, to?: string) {
    const { start, end } = this.parseRange(from, to);
    const sales = await this.prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { items: { include: { batch: true, product: true } } },
    });
    return computeSalesStats(sales);
  }

  /** Eng ko'p sotilgan dorilar (savdo summasi bo'yicha) */
  async top(from?: string, to?: string, limit = 10) {
    const { start, end } = this.parseRange(from, to);
    const items = await this.prisma.saleItem.findMany({
      where: { sale: { createdAt: { gte: start, lte: end } } },
      include: { product: true },
    });

    const map = new Map<
      number,
      { name: string; quantity: number; revenue: Prisma.Decimal }
    >();
    for (const item of items) {
      const cur = map.get(item.productId) ?? {
        name: item.product.name,
        quantity: 0,
        revenue: new Prisma.Decimal(0),
      };
      cur.quantity += item.quantity;
      cur.revenue = cur.revenue.add(item.subtotal);
      map.set(item.productId, cur);
    }

    return [...map.entries()]
      .map(([productId, v]) => ({
        productId,
        name: v.name,
        quantity: v.quantity,
        revenue: v.revenue.toFixed(2),
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, Math.min(Math.max(limit, 1), 50));
  }

  /** Kunlik savdo (oddiy grafik uchun) */
  async daily(from?: string, to?: string) {
    const { start, end } = this.parseRange(from, to);
    const sales = await this.prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    const map = new Map<string, Prisma.Decimal>();
    for (const s of sales) {
      const key = s.createdAt.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? new Prisma.Decimal(0)).add(s.total));
    }
    return [...map.entries()].map(([date, total]) => ({
      date,
      revenue: total.toFixed(2),
    }));
  }
}
