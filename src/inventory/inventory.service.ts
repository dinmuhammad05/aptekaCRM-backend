import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ImportStockDto } from './dto/import-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Yangi partiya qabul qilish (prixod) */
  async receive(dto: ReceiveStockDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException(`Dori topilmadi (id=${dto.productId})`);
    }

    // Qoldiq har doim donada saqlanadi: pachka donaga o'tkazilib, ochiq dona
    // qo'shiladi (masalan 5 pachka + 45 dona)
    const quantity =
      (dto.packs ?? 0) * product.unitsPerPack + (dto.pieces ?? 0);
    if (quantity <= 0) {
      throw new BadRequestException("Miqdor 0 dan katta bo'lishi kerak");
    }

    return this.prisma.batch.create({
      data: {
        pharmacyId: requirePharmacyId(),
        productId: dto.productId,
        batchNumber: dto.batchNumber,
        expiryDate: new Date(dto.expiryDate),
        quantity,
        costPrice: dto.costPrice,
        sellPrice: dto.sellPrice,
      },
    });
  }

  /**
   * Excel nakladnoyini ommaviy import qilish (atomik).
   * Har qator uchun: productId bo'lsa o'sha doriga, aks holda yangi dori
   * yaratib, unga prixod (partiya) qo'shiladi. Bitta tranzaksiya — birortasi
   * xato bersa, hammasi bekor qilinadi.
   */
  async importStock(dto: ImportStockDto) {
    const pharmacyId = requirePharmacyId();
    return this.prisma.$transaction(async (tx) => {
      let createdProducts = 0;
      let createdBatches = 0;

      for (const [index, item] of dto.items.entries()) {
        const product = await this.resolveProduct(tx, item, index, pharmacyId);

        // Narx pasayishidan himoya: mavjud doriga yangi narx joriy (FEFO)
        // sotuv narxidan past kelsa — eski (yuqori) narx saqlanadi va kassirga
        // ogohlantirish xabari yoziladi. Yangi dorida taqqoslash bo'lmaydi.
        const effectiveSell = await this.resolvePriceWithGuard(
          tx,
          product,
          item,
          pharmacyId,
        );

        const quantity = item.packs * product.unitsPerPack;
        await tx.batch.create({
          data: {
            pharmacyId,
            productId: product.id,
            batchNumber: item.batchNumber,
            expiryDate: new Date(item.expiryDate),
            quantity,
            costPrice: item.costPrice,
            sellPrice: effectiveSell,
          },
        });
        createdBatches += 1;
        if (!item.productId) createdProducts += 1;
      }

      return { products: createdProducts, batches: createdBatches };
    });
  }

  /** Import qatori uchun mavjud dorini topadi yoki yangisini yaratadi. */
  private async resolveProduct(
    tx: Prisma.TransactionClient,
    item: ImportStockDto['items'][number],
    index: number,
    pharmacyId: number,
  ) {
    if (item.productId) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product) {
        throw new NotFoundException(
          `Qator ${index + 1}: dori topilmadi (id=${item.productId})`,
        );
      }
      return product;
    }

    if (!item.name?.trim()) {
      throw new BadRequestException(
        `Qator ${index + 1}: yangi dori uchun nom majburiy`,
      );
    }

    return tx.product.create({
      data: {
        pharmacyId,
        name: item.name.trim(),
        manufacturer: item.manufacturer,
        form: item.form,
        unit: item.unit ?? 'dona',
        unitsPerPack: item.unitsPerPack ?? 1,
      },
    });
  }

  /**
   * Yangi partiya uchun amaldagi sotish narxini aniqlaydi.
   * Mavjud dori bo'lsa joriy (FEFO) sotuv narxi bilan taqqoslaydi: yangi narx
   * past bo'lsa — eski narxni qaytaradi (narx pasaymaydi) va PRICE_DROP xabarini
   * yaratadi. Aks holda yangi narx qaytadi.
   */
  private async resolvePriceWithGuard(
    tx: Prisma.TransactionClient,
    product: { id: number; name: string },
    item: ImportStockDto['items'][number],
    pharmacyId: number,
  ): Promise<number> {
    if (!item.productId) return item.sellPrice;

    const currentBatch = await tx.batch.findFirst({
      where: { productId: product.id, quantity: { gt: 0 } },
      orderBy: { expiryDate: 'asc' },
    });
    if (!currentBatch) return item.sellPrice;

    const currentSell = currentBatch.sellPrice.toNumber();
    if (item.sellPrice >= currentSell) return item.sellPrice;

    await tx.notification.create({
      data: {
        pharmacyId,
        type: 'PRICE_DROP',
        productId: product.id,
        productName: product.name,
        oldPrice: currentSell,
        newPrice: item.sellPrice,
      },
    });
    return currentSell;
  }

  /** Har bir dori bo'yicha umumiy qoldiq + partiyalar */
  async stock() {
    const products = await this.prisma.product.findMany({
      orderBy: { name: 'asc' },
      include: {
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    return products.map((product) => {
      const totalStock = product.batches.reduce(
        (sum, b) => sum + b.quantity,
        0,
      ); // donada
      return {
        ...product,
        totalStock,
        fullPacks: Math.floor(totalStock / product.unitsPerPack),
        loosePieces: totalStock % product.unitsPerPack,
        lowStock: totalStock <= product.minStock,
      };
    });
  }

  /** Yaroqlilik muddati yaqinlashayotgan partiyalar (standart 30 kun) */
  async expiringSoon(days = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);

    return this.prisma.batch.findMany({
      where: {
        quantity: { gt: 0 },
        expiryDate: { lte: threshold },
      },
      orderBy: { expiryDate: 'asc' },
      include: { product: true },
    });
  }

  /**
   * Mavjud partiyani to'g'rilash (narx, muddat, qoldiq, partiya raqami).
   * Faqat berilgan maydonlar yangilanadi. `quantity` donada keladi.
   */
  async updateBatch(id: number, dto: UpdateBatchDto) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException(`Partiya topilmadi (id=${id})`);
    }

    return this.prisma.batch.update({
      where: { id },
      data: {
        ...(dto.batchNumber !== undefined && { batchNumber: dto.batchNumber }),
        ...(dto.expiryDate !== undefined && {
          expiryDate: new Date(dto.expiryDate),
        }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.costPrice !== undefined && { costPrice: dto.costPrice }),
        ...(dto.sellPrice !== undefined && { sellPrice: dto.sellPrice }),
      },
    });
  }

  /**
   * Partiyani o'chiradi. Agar shu partiyadan sotuv bo'lgan bo'lsa (SaleItem
   * bog'langan) — tarix buzilmasligi uchun o'chirilmaydi, do'stona xato qaytadi.
   */
  async deleteBatch(id: number) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException(`Partiya topilmadi (id=${id})`);
    }

    const soldCount = await this.prisma.saleItem.count({
      where: { batchId: id },
    });
    if (soldCount > 0) {
      throw new BadRequestException(
        "Bu partiyadan sotuv bo'lgan, o'chirib bo'lmaydi. Qoldiqni 0 ga tushiring.",
      );
    }

    await this.prisma.batch.delete({ where: { id } });
    return { id };
  }

  /**
   * Inventarizatsiya: dorining haqiqiy qoldig'ini (donada) berib, tizim
   * partiyalarni avtomatik to'g'rilaydi — foydalanuvchi partiya tanlamaydi.
   *  - kamaytirish kerak bo'lsa: muddati eng yaqin (FEFO) partiyadan boshlab kamaytiriladi
   *  - ko'paytirish kerak bo'lsa: mavjud (front) partiyaga qo'shiladi
   *    (partiya umuman bo'lmasa — narx/muddat kerakligi uchun avval qabul qilish so'raladi)
   */
  async adjustStock(dto: AdjustStockDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product) {
        throw new NotFoundException(`Dori topilmadi (id=${dto.productId})`);
      }

      const batches = await tx.batch.findMany({
        where: { productId: dto.productId },
        orderBy: { expiryDate: 'asc' },
      });
      const currentTotal = batches.reduce((sum, b) => sum + b.quantity, 0);
      const delta = dto.quantity - currentTotal;

      if (delta < 0) {
        // Kamaytirish — FEFO bo'yicha (eng yaqin muddatdan)
        let toRemove = -delta;
        for (const batch of batches) {
          if (toRemove <= 0) break;
          const take = Math.min(batch.quantity, toRemove);
          if (take > 0) {
            await tx.batch.update({
              where: { id: batch.id },
              data: { quantity: { decrement: take } },
            });
            toRemove -= take;
          }
        }
      } else if (delta > 0) {
        // Ko'paytirish — mavjud (front) partiyaga qo'shamiz
        const front = batches[0];
        if (!front) {
          throw new BadRequestException(
            "Faol partiya yo'q — avval dorini qabul qiling (narx va muddat kerak)",
          );
        }
        await tx.batch.update({
          where: { id: front.id },
          data: { quantity: { increment: delta } },
        });
      }

      return { productId: dto.productId, totalStock: dto.quantity };
    });
  }
}
