import { Injectable, NotFoundException } from '@nestjs/common';
import { PharmacyStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePharmacyDto } from './dto/create-pharmacy.dto';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';

/** Obuna holati (sana asosida hisoblanadi) */
type SubscriptionState = 'NONE' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED';

const EXPIRING_DAYS = 7;

@Injectable()
export class SuperadminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Obuna sanasidan holatni aniqlaydi */
  private subscriptionState(endsAt: Date | null): SubscriptionState {
    if (!endsAt) return 'NONE';
    const now = Date.now();
    const end = endsAt.getTime();
    if (end < now) return 'EXPIRED';
    const days = (end - now) / (1000 * 60 * 60 * 24);
    return days <= EXPIRING_DAYS ? 'EXPIRING' : 'ACTIVE';
  }

  /**
   * Aptekalar ro'yxati — obuna holati, foydalanuvchilar/sotuvlar soni bilan.
   * Muddati o'tgan, ammo hali xabar berilmagan aptekalar uchun SUPERADMINga
   * SUBSCRIPTION_EXPIRED xabari yaratiladi (admin ko'rib, blok/qoldirishni hal qiladi).
   */
  async listPharmacies() {
    const pharmacies = await this.prisma.pharmacy.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { users: true, products: true, sales: true } },
      },
    });

    for (const p of pharmacies) {
      if (
        p.status === 'ACTIVE' &&
        this.subscriptionState(p.subscriptionEndsAt) === 'EXPIRED'
      ) {
        await this.ensureExpiryNotification(p.id, p.name);
      }
    }

    return pharmacies.map((p) => ({
      id: p.id,
      name: p.name,
      ownerName: p.ownerName,
      phone: p.phone,
      status: p.status,
      subscriptionEndsAt: p.subscriptionEndsAt,
      subscriptionState: this.subscriptionState(p.subscriptionEndsAt),
      monthlyPrice: p.monthlyPrice,
      note: p.note,
      createdAt: p.createdAt,
      counts: p._count,
    }));
  }

  /** Muddati o'tgan apteka uchun SUPERADMINga xabar (dublikatsiz) */
  private async ensureExpiryNotification(pharmacyId: number, name: string) {
    const existing = await this.prisma.notification.findFirst({
      where: {
        pharmacyId: null,
        type: 'SUBSCRIPTION_EXPIRED',
        productId: pharmacyId, // tegishli apteka IDsi shu yerda saqlanadi
        read: false,
      },
    });
    if (existing) return;

    await this.prisma.notification.create({
      data: {
        pharmacyId: null, // SUPERADMIN uchun xabar
        type: 'SUBSCRIPTION_EXPIRED',
        productId: pharmacyId,
        productName: name,
      },
    });
  }

  /** Yangi apteka + uning admin foydalanuvchisini yaratadi */
  async createPharmacy(dto: CreatePharmacyDto) {
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const pharmacy = await tx.pharmacy.create({
        data: {
          name: dto.name,
          ownerName: dto.ownerName,
          phone: dto.phone,
          note: dto.note,
          subscriptionEndsAt: dto.subscriptionEndsAt
            ? new Date(dto.subscriptionEndsAt)
            : null,
          monthlyPrice: dto.monthlyPrice ?? null,
        },
      });

      await tx.user.create({
        data: {
          pharmacyId: pharmacy.id,
          username: dto.adminUsername,
          passwordHash,
          name: dto.adminName ?? dto.name,
          role: 'ADMIN',
        },
      });

      return pharmacy;
    });
  }

  async updatePharmacy(id: number, dto: UpdatePharmacyDto) {
    await this.getPharmacy(id);
    return this.prisma.pharmacy.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.ownerName !== undefined && { ownerName: dto.ownerName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.subscriptionEndsAt !== undefined && {
          subscriptionEndsAt: dto.subscriptionEndsAt
            ? new Date(dto.subscriptionEndsAt)
            : null,
        }),
        ...(dto.monthlyPrice !== undefined && {
          monthlyPrice: dto.monthlyPrice,
        }),
      },
    });
  }

  /**
   * Obunani N oyga uzaytiradi: yangi tugash sanasi joriy tugash sanasidan
   * (agar hali faol bo'lsa) yoki bugundan boshlab hisoblanadi. SaaS daromadi
   * sifatida to'lov (monthlyPrice * months) yoziladi va apteka faollashtiriladi.
   */
  async extendSubscription(id: number, months: number) {
    const pharmacy = await this.getPharmacy(id);
    const now = new Date();
    const base =
      pharmacy.subscriptionEndsAt && pharmacy.subscriptionEndsAt > now
        ? new Date(pharmacy.subscriptionEndsAt)
        : new Date(now);
    const newEnd = new Date(base);
    newEnd.setMonth(newEnd.getMonth() + months);

    const price = pharmacy.monthlyPrice ?? new Prisma.Decimal(0);
    const amount = new Prisma.Decimal(price).mul(months);

    return this.prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.create({
        data: { pharmacyId: id, months, amount },
      });
      const updated = await tx.pharmacy.update({
        where: { id },
        data: { subscriptionEndsAt: newEnd, status: 'ACTIVE' },
      });
      // Tegishli muddat xabarlarini o'qilgan deb belgilaymiz
      await tx.notification.updateMany({
        where: {
          pharmacyId: null,
          type: 'SUBSCRIPTION_EXPIRED',
          productId: id,
        },
        data: { read: true },
      });
      return updated;
    });
  }

  /** SaaS obuna daromadi: jami, shu oy, oxirgi to'lovlar */
  async revenueStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [allAgg, monthAgg, recent] = await Promise.all([
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { createdAt: { gte: monthStart } },
      }),
      this.prisma.subscriptionPayment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { pharmacy: { select: { name: true } } },
      }),
    ]);
    return {
      total: allAgg._sum.amount ?? new Prisma.Decimal(0),
      totalCount: allAgg._count,
      thisMonth: monthAgg._sum.amount ?? new Prisma.Decimal(0),
      thisMonthCount: monthAgg._count,
      recent: recent.map((p) => ({
        id: p.id,
        pharmacyName: p.pharmacy.name,
        months: p.months,
        amount: p.amount,
        createdAt: p.createdAt,
      })),
    };
  }

  /** Aptekalar savdosi: har apteka bo'yicha sotuvlar soni va aylanma + jami */
  async salesOverview() {
    const grouped = await this.prisma.sale.groupBy({
      by: ['pharmacyId'],
      _sum: { total: true },
      _count: { _all: true },
    });
    const pharmacies = await this.prisma.pharmacy.findMany({
      select: { id: true, name: true },
    });
    const nameById = new Map(pharmacies.map((p) => [p.id, p.name]));

    const rows = grouped
      .map((g) => ({
        pharmacyId: g.pharmacyId,
        name: nameById.get(g.pharmacyId) ?? `#${g.pharmacyId}`,
        sales: g._count._all,
        turnover: g._sum.total ?? new Prisma.Decimal(0),
      }))
      .sort((a, b) => Number(b.turnover) - Number(a.turnover));

    const totalSales = rows.reduce((s, r) => s + r.sales, 0);
    const totalTurnover = rows.reduce(
      (s, r) => s.add(r.turnover),
      new Prisma.Decimal(0),
    );
    return { totalSales, totalTurnover, rows };
  }

  /** Aptekani bloklash yoki faollashtirish */
  async setStatus(id: number, status: PharmacyStatus) {
    await this.getPharmacy(id);
    const pharmacy = await this.prisma.pharmacy.update({
      where: { id },
      data: { status },
    });

    // Faollashtirilganda, tegishli obuna xabarlarini o'qilgan deb belgilaymiz
    if (status === 'ACTIVE') {
      await this.prisma.notification.updateMany({
        where: {
          pharmacyId: null,
          type: 'SUBSCRIPTION_EXPIRED',
          productId: id,
        },
        data: { read: true },
      });
    }
    return pharmacy;
  }

  /** Boshqaruv paneli uchun umumiy ko'rsatkichlar */
  async dashboard() {
    const [total, active, blocked] = await Promise.all([
      this.prisma.pharmacy.count(),
      this.prisma.pharmacy.count({ where: { status: 'ACTIVE' } }),
      this.prisma.pharmacy.count({ where: { status: 'BLOCKED' } }),
    ]);

    const withSubscription = await this.prisma.pharmacy.findMany({
      where: { status: 'ACTIVE', subscriptionEndsAt: { not: null } },
      select: { subscriptionEndsAt: true },
    });
    let expiring = 0;
    let expired = 0;
    for (const p of withSubscription) {
      const state = this.subscriptionState(p.subscriptionEndsAt);
      if (state === 'EXPIRING') expiring += 1;
      if (state === 'EXPIRED') expired += 1;
    }

    return { total, active, blocked, expiring, expired };
  }

  /** SUPERADMIN xabarlari (apteka bilan bog'lanmagan) */
  listNotifications(limit = 50) {
    return this.prisma.notification.findMany({
      where: { pharmacyId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markNotificationRead(id: number) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllNotificationsRead() {
    await this.prisma.notification.updateMany({
      where: { pharmacyId: null, read: false },
      data: { read: true },
    });
    return { ok: true };
  }

  private async getPharmacy(id: number) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id } });
    if (!pharmacy) {
      throw new NotFoundException(`Apteka topilmadi (id=${id})`);
    }
    return pharmacy;
  }
}
