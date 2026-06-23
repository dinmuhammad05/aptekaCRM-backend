import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { CloseShiftDto } from './dto/close-shift.dto';
import { OpenShiftDto } from './dto/open-shift.dto';

/** Smena bo'yicha sotuvlar yig'indisi (X/Z hisobot) */
export interface ShiftReport {
  salesCount: number;
  revenue: string; // jami savdo (total)
  cashTotal: string; // naqd sotuvlardan tushgan (paid, CASH)
  cardTotal: string; // karta sotuvlardan (paid, CARD)
  creditTotal: string; // nasiyaga ketgan (total - paid)
  expectedCash: string; // kutilgan naqd = openingCash + cashTotal
}

/** Bitta smena bo'yicha to'lov turi kesimidagi yig'indi qator */
type PaymentGroup = {
  paymentType: 'CASH' | 'CARD';
  _sum: { total: Prisma.Decimal | null; paid: Prisma.Decimal | null };
  _count: { _all: number };
};

/**
 * Kassir smenasi: ochish/yopish va naqd kassani solishtirish. Smena ochiq
 * bo'lsa, sotuvlar avtomatik unga bog'lanadi (sales.service). Tenant
 * izolyatsiyasi Prisma extension orqali — pharmacyId qo'lda yozilmaydi.
 */
@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Joriy kassirning ochiq smenasi (yo'q bo'lsa null) + uning X-hisoboti */
  async current(userId: number) {
    const shift = await this.prisma.shift.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (!shift) return null;
    return { ...shift, report: await this.reportFor(shift.id, shift.openingCash) };
  }

  /** Smena ochish — kassirda ochiq smena bo'lsa, ikkinchisini ochib bo'lmaydi */
  async open(userId: number, dto: OpenShiftDto) {
    const existing = await this.prisma.shift.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (existing) {
      throw new BadRequestException(
        'Sizda ochiq smena bor — avval uni yoping',
      );
    }
    return this.prisma.shift.create({
      data: {
        pharmacyId: requirePharmacyId(),
        userId,
        openingCash: new Prisma.Decimal(dto.openingCash ?? 0),
        note: dto.note?.trim() || null,
      },
    });
  }

  /** Smenani yopish: hisobot hisoblanadi, sanab chiqilgan naqd saqlanadi */
  async close(id: number, userId: number, dto: CloseShiftDto) {
    const shift = await this.prisma.shift.findFirst({ where: { id } });
    if (!shift) throw new NotFoundException('Smena topilmadi');
    if (shift.status === 'CLOSED') {
      throw new BadRequestException('Smena allaqachon yopilgan');
    }
    if (shift.userId !== userId) {
      throw new BadRequestException('Bu smena boshqa kassirga tegishli');
    }
    const report = await this.reportFor(id, shift.openingCash);
    const closed = await this.prisma.shift.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closingCash: new Prisma.Decimal(dto.closingCash),
        closedAt: new Date(),
        note: dto.note?.trim() || shift.note,
      },
    });
    return { ...closed, report, difference: this.difference(closed, report) };
  }

  /** Bitta smena + hisobot (X-hisobot) + sotilgan dorilar kesimi */
  async getOne(id: number) {
    const shift = await this.prisma.shift.findFirst({
      where: { id },
      include: { user: { select: { name: true, username: true } } },
    });
    if (!shift) throw new NotFoundException('Smena topilmadi');
    const report = await this.reportFor(id, shift.openingCash);
    const products = await this.soldProducts(id);
    return {
      ...shift,
      report,
      difference: this.difference(shift, report),
      products,
    };
  }

  /**
   * Smenada sotilgan dorilar kesimi (nomi, soni, savdo summasi), summasi
   * bo'yicha kamayish tartibida. Soni PACK/PIECE birliklarining yig'indisi
   * (sales.service `top()` bilan bir xil mantiq).
   */
  private async soldProducts(shiftId: number) {
    const items = await this.prisma.saleItem.findMany({
      where: { sale: { shiftId } },
      include: { product: { select: { name: true } } },
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
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));
  }

  /** Oxirgi smenalar tarixi (hisobotlari bilan, bitta groupBy — tez) */
  async list(limit = 30) {
    const shifts = await this.prisma.shift.findMany({
      orderBy: { openedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { user: { select: { name: true, username: true } } },
    });
    if (shifts.length === 0) return [];

    const grouped = await this.prisma.sale.groupBy({
      by: ['shiftId', 'paymentType'],
      where: { shiftId: { in: shifts.map((s) => s.id) } },
      _sum: { total: true, paid: true },
      _count: { _all: true },
    });
    const byShift = new Map<number, PaymentGroup[]>();
    for (const row of grouped) {
      if (row.shiftId == null) continue;
      const arr = byShift.get(row.shiftId) ?? [];
      arr.push(row as PaymentGroup);
      byShift.set(row.shiftId, arr);
    }

    return shifts.map((s) => {
      const report = this.buildReport(s.openingCash, byShift.get(s.id) ?? []);
      return { ...s, report, difference: this.difference(s, report) };
    });
  }

  /** Yopilgan smena uchun naqd farqi (musbat = ortiqcha, manfiy = kamomad) */
  private difference(
    shift: { closingCash: Prisma.Decimal | null },
    report: ShiftReport,
  ): string | null {
    if (shift.closingCash == null) return null;
    return shift.closingCash.sub(report.expectedCash).toFixed(2);
  }

  private async reportFor(shiftId: number, openingCash: Prisma.Decimal) {
    const grouped = await this.prisma.sale.groupBy({
      by: ['paymentType'],
      where: { shiftId },
      _sum: { total: true, paid: true },
      _count: { _all: true },
    });
    return this.buildReport(openingCash, grouped as PaymentGroup[]);
  }

  private buildReport(
    openingCash: Prisma.Decimal,
    rows: PaymentGroup[],
  ): ShiftReport {
    let revenue = new Prisma.Decimal(0);
    let paid = new Prisma.Decimal(0);
    let cash = new Prisma.Decimal(0);
    let card = new Prisma.Decimal(0);
    let count = 0;
    for (const row of rows) {
      revenue = revenue.add(row._sum.total ?? 0);
      paid = paid.add(row._sum.paid ?? 0);
      count += row._count._all;
      if (row.paymentType === 'CASH') cash = cash.add(row._sum.paid ?? 0);
      if (row.paymentType === 'CARD') card = card.add(row._sum.paid ?? 0);
    }
    return {
      salesCount: count,
      revenue: revenue.toFixed(2),
      cashTotal: cash.toFixed(2),
      cardTotal: card.toFixed(2),
      creditTotal: revenue.sub(paid).toFixed(2),
      expectedCash: openingCash.add(cash).toFixed(2),
    };
  }
}
