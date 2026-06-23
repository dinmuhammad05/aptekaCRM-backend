import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerPaymentDto } from './dto/customer-payment.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/**
 * Mijozlar va nasiya (qarz) boshqaruvi. Tenant izolyatsiyasi Prisma
 * extension orqali avtomatik — bu yerda pharmacyId qo'lda yozilmaydi.
 * `Customer.debt` — qarzning keshlangan qiymati: nasiya savdosida oshadi
 * (sales.service), to'lovda kamayadi (recordPayment) — har doim tranzaksiyada.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mijozlar ro'yxati (ism/telefon bo'yicha qidiruv, qarzdorlar oldinda) */
  list(search?: string, onlyDebtors = false) {
    const where: Prisma.CustomerWhereInput = {};
    const q = search?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    if (onlyDebtors) where.debt = { gt: 0 };
    return this.prisma.customer.findMany({
      where,
      orderBy: [{ debt: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  }

  /** Umumiy qarz va qarzdorlar soni (dashboard uchun) */
  async summary() {
    const agg = await this.prisma.customer.aggregate({
      _sum: { debt: true },
      _count: true,
      where: { debt: { gt: 0 } },
    });
    return {
      totalDebt: agg._sum.debt ?? new Prisma.Decimal(0),
      debtorsCount: agg._count,
    };
  }

  /** Bitta mijoz + oxirgi savdolar va to'lovlar tarixi */
  async getOne(id: number) {
    const customer = await this.ensureExists(id);
    const [sales, payments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { customerId: id },
        select: { id: true, total: true, paid: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.customerPayment.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { ...customer, sales, payments };
  }

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        note: dto.note?.trim() || null,
        pharmacyId: requirePharmacyId(),
      },
    });
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.ensureExists(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
        ...(dto.note !== undefined && { note: dto.note.trim() || null }),
      },
    });
  }

  async remove(id: number) {
    const customer = await this.ensureExists(id);
    if (!customer.debt.eq(0)) {
      throw new BadRequestException("Qarzi bor mijozni o'chirib bo'lmaydi");
    }
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  /** Qarzni kamaytiruvchi to'lov qabul qilish (qarz manfiyga tushmaydi) */
  async recordPayment(id: number, dto: CustomerPaymentDto, userId?: number) {
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id } });
      if (!customer) throw new NotFoundException('Mijoz topilmadi');
      const newDebt = Prisma.Decimal.max(0, customer.debt.sub(amount));
      await tx.customerPayment.create({
        data: {
          customerId: id,
          amount,
          note: dto.note?.trim() || null,
          userId,
          pharmacyId: customer.pharmacyId,
        },
      });
      return tx.customer.update({ where: { id }, data: { debt: newDebt } });
    });
  }

  private async ensureExists(id: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id } });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
    return customer;
  }
}
