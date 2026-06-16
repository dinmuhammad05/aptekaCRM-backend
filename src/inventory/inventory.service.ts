import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

    // Pachka soni donaga o'tkaziladi: qoldiq har doim donada saqlanadi
    const quantity = dto.packs * product.unitsPerPack;

    return this.prisma.batch.create({
      data: {
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
    return this.prisma.$transaction(async (tx) => {
      let createdProducts = 0;
      let createdBatches = 0;

      for (const [index, item] of dto.items.entries()) {
        const product = await this.resolveProduct(tx, item, index);

        // Narx pasayishidan himoya: mavjud doriga yangi narx joriy (FEFO)
        // sotuv narxidan past kelsa — eski (yuqori) narx saqlanadi va kassirga
        // ogohlantirish xabari yoziladi. Yangi dorida taqqoslash bo'lmaydi.
        const effectiveSell = await this.resolvePriceWithGuard(tx, product, item);

        const quantity = item.packs * product.unitsPerPack;
        await tx.batch.create({
          data: {
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
}
