import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from '../common/date';
import { computeSalesStats } from '../common/sales-stats';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

/**
 * Operatsion xarajatlar va sof foyda. Tenant izolyatsiyasi Prisma extension
 * orqali. Sof foyda = yalpi foyda (savdo − tannarx, sales-stats helperi) −
 * xarajatlar; shu sabab hisob bir joyda (DRY) saqlanadi.
 */
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  list(from?: string, to?: string) {
    return this.prisma.expense.findMany({
      where: this.rangeWhere(from, to),
      orderBy: { spentAt: 'desc' },
      take: 500,
    });
  }

  /** Davr bo'yicha: yalpi foyda, xarajatlar (kategoriya kesimi), sof foyda */
  async summary(from?: string, to?: string) {
    const where = this.rangeWhere(from, to);
    const [sales, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: this.saleRangeWhere(from, to),
        include: { items: { include: { batch: true, product: true } } },
      }),
      this.prisma.expense.findMany({ where, select: { category: true, amount: true } }),
    ]);

    const stats = computeSalesStats(sales);
    let expensesTotal = new Prisma.Decimal(0);
    const byCategory = new Map<string, Prisma.Decimal>();
    for (const e of expenses) {
      expensesTotal = expensesTotal.add(e.amount);
      byCategory.set(
        e.category,
        (byCategory.get(e.category) ?? new Prisma.Decimal(0)).add(e.amount),
      );
    }
    const grossProfit = new Prisma.Decimal(stats.profit);
    return {
      revenue: stats.revenue,
      grossProfit: stats.profit,
      expensesTotal: expensesTotal.toFixed(2),
      netProfit: grossProfit.sub(expensesTotal).toFixed(2),
      byCategory: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount: amount.toFixed(2) }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    };
  }

  create(dto: CreateExpenseDto, userId?: number) {
    return this.prisma.expense.create({
      data: {
        pharmacyId: requirePharmacyId(),
        category: dto.category.trim(),
        amount: new Prisma.Decimal(dto.amount),
        note: dto.note?.trim() || null,
        userId,
        spentAt: dto.spentAt ? new Date(dto.spentAt) : new Date(),
      },
    });
  }

  async update(id: number, dto: UpdateExpenseDto) {
    await this.ensureExists(id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.category !== undefined && { category: dto.category.trim() }),
        ...(dto.amount !== undefined && {
          amount: new Prisma.Decimal(dto.amount),
        }),
        ...(dto.note !== undefined && { note: dto.note.trim() || null }),
        ...(dto.spentAt !== undefined && { spentAt: new Date(dto.spentAt) }),
      },
    });
  }

  async remove(id: number) {
    await this.ensureExists(id);
    await this.prisma.expense.delete({ where: { id } });
    return { success: true };
  }

  private rangeWhere(from?: string, to?: string): Prisma.ExpenseWhereInput {
    const start = from ? startOfDay(new Date(from)) : null;
    const end = to ? endOfDay(new Date(to)) : null;
    if (!start && !end) return {};
    return {
      spentAt: { ...(start && { gte: start }), ...(end && { lte: end }) },
    };
  }

  private saleRangeWhere(from?: string, to?: string): Prisma.SaleWhereInput {
    const start = from ? startOfDay(new Date(from)) : null;
    const end = to ? endOfDay(new Date(to)) : null;
    if (!start && !end) return {};
    return {
      createdAt: { ...(start && { gte: start }), ...(end && { lte: end }) },
    };
  }

  private async ensureExists(id: number) {
    const e = await this.prisma.expense.findFirst({ where: { id } });
    if (!e) throw new NotFoundException('Xarajat topilmadi');
    return e;
  }
}
