import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierPaymentDto } from './dto/supplier-payment.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

/**
 * Ta'minotchilar va ularga qarz boshqaruvi. Mijoz-nasiya moduliga simmetrik:
 * `Supplier.debt` — ta'minotchiga qarzimizning keshlangan qiymati. Prixodda
 * (inventory.service.receive) oshadi, to'lovda (recordPayment) kamayadi.
 * Tenant izolyatsiyasi Prisma extension orqali avtomatik.
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ta'minotchilar ro'yxati (ism/telefon qidiruv, qarzdorlari oldinda) */
  list(search?: string, onlyDebtors = false) {
    const where: Prisma.SupplierWhereInput = {};
    const q = search?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    if (onlyDebtors) where.debt = { gt: 0 };
    return this.prisma.supplier.findMany({
      where,
      orderBy: [{ debt: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  }

  /** Umumiy qarzimiz va qarzdor ta'minotchilar soni */
  async summary() {
    const agg = await this.prisma.supplier.aggregate({
      _sum: { debt: true },
      _count: true,
      where: { debt: { gt: 0 } },
    });
    return {
      totalDebt: agg._sum.debt ?? new Prisma.Decimal(0),
      debtorsCount: agg._count,
    };
  }

  /** Bitta ta'minotchi + oxirgi kelgan partiyalar va to'lovlar tarixi */
  async getOne(id: number) {
    const supplier = await this.ensureExists(id);
    const [deliveries, payments] = await Promise.all([
      this.prisma.batch.findMany({
        where: { supplierId: id },
        select: {
          id: true,
          quantity: true,
          costPrice: true,
          receivedAt: true,
          product: { select: { name: true, unitsPerPack: true } },
        },
        orderBy: { receivedAt: 'desc' },
        take: 20,
      }),
      this.prisma.supplierPayment.findMany({
        where: { supplierId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { ...supplier, deliveries, payments };
  }

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        note: dto.note?.trim() || null,
        debt: new Prisma.Decimal(dto.openingDebt ?? 0),
        pharmacyId: requirePharmacyId(),
      },
    });
  }

  async update(id: number, dto: UpdateSupplierDto) {
    await this.ensureExists(id);
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
        ...(dto.note !== undefined && { note: dto.note.trim() || null }),
      },
    });
  }

  async remove(id: number) {
    const supplier = await this.ensureExists(id);
    if (!supplier.debt.eq(0)) {
      throw new BadRequestException(
        "Qarzi bor ta'minotchini o'chirib bo'lmaydi",
      );
    }
    await this.prisma.supplier.delete({ where: { id } });
    return { success: true };
  }

  /** Ta'minotchiga to'lov — qarzimizni kamaytiradi (manfiyga tushmaydi) */
  async recordPayment(id: number, dto: SupplierPaymentDto, userId?: number) {
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id } });
      if (!supplier) throw new NotFoundException("Ta'minotchi topilmadi");
      const newDebt = Prisma.Decimal.max(0, supplier.debt.sub(amount));
      await tx.supplierPayment.create({
        data: {
          supplierId: id,
          amount,
          note: dto.note?.trim() || null,
          userId,
          pharmacyId: supplier.pharmacyId,
        },
      });
      return tx.supplier.update({ where: { id }, data: { debt: newDebt } });
    });
  }

  private async ensureExists(id: number) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id } });
    if (!supplier) throw new NotFoundException("Ta'minotchi topilmadi");
    return supplier;
  }
}
