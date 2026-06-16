import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SaleUnit } from '@prisma/client';
import { computePiecePrice } from '../common/pricing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto, DiscountType } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sotuvni amalga oshiradi. Bir tranzaksiya ichida:
   *  - har bir mahsulot uchun FEFO (muddati eng yaqin partiyadan) qoldiqni kamaytiradi
   *  - chek (Sale) va qatorlarni (SaleItem) yozadi
   * Qoldiq yetmasa — butun tranzaksiya bekor qilinadi.
   */
  async create(dto: CreateSaleDto) {
    // Muddati o'tgan dorini sotib bo'lmaydi: bugundan oldingi partiyalar hisobga
    // olinmaydi (sana bo'yicha, vaqtsiz)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.$transaction(async (tx) => {
      const saleItemsData: Prisma.SaleItemCreateManySaleInput[] = [];
      let subtotal = new Prisma.Decimal(0);

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new NotFoundException(
            `Dori topilmadi (id=${item.productId})`,
          );
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

      return tx.sale.create({
        data: {
          subtotal,
          discount,
          total,
          paymentType: dto.paymentType,
          items: { createMany: { data: saleItemsData } },
        },
        include: { items: true },
      });
    });
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
  findAll(take = 50, skip = 0) {
    return this.prisma.sale.findMany({
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
}
