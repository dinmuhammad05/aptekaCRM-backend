import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computePiecePrice } from '../common/pricing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportCatalogDto } from './dto/import-catalog.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/** Nomni moslashtirish uchun normallashtirish (katalog dedupe uchun) */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  /**
   * Boshlang'ich katalogni ommaviy yuklash (faqat dori kartochkalari, partiya emas).
   * Bitta `createMany` bilan kiritiladi — 3767+ qator uchun ham tez, tranzaksiya
   * loopi yo'q (timeout muammosi bo'lmaydi). `Product.name` unique emas, shu sabab
   * dublikatlar app darajasida (mavjud nomlar + fayl ichi) tashlanadi.
   */
  async importCatalog(dto: ImportCatalogDto) {
    const total = dto.items.length;

    // Bazadagi mavjud nomlar (normallashtirilgan) — qaytadan kiritmaslik uchun
    const existing = await this.prisma.product.findMany({
      select: { name: true },
    });
    const existingNames = new Set(existing.map((p) => normalizeName(p.name)));

    const seen = new Set<string>();
    const toCreate: { name: string; defaultCostPrice?: number }[] = [];
    const skippedNames: string[] = [];

    for (const item of dto.items) {
      const key = normalizeName(item.name);
      if (!key) continue; // bo'sh nom — tashlanadi (nom yo'q, xabarga yozib bo'lmaydi)
      if (existingNames.has(key) || seen.has(key)) {
        // dublikat (bazada bor yoki fayl ichida takrorlangan)
        skippedNames.push(item.name.trim());
        continue;
      }
      seen.add(key);
      toCreate.push({
        name: item.name.trim(),
        defaultCostPrice: item.defaultCostPrice,
      });
    }

    const { count } = await this.prisma.product.createMany({ data: toCreate });

    // O'tkazib yuborilgan (dublikat) dorilar haqida kassir uchun xabar yoziladi
    if (skippedNames.length > 0) {
      await this.prisma.notification.createMany({
        data: skippedNames.map((name) => ({
          type: 'CATALOG_SKIPPED',
          productName: name,
        })),
      });
    }

    return { created: count, skipped: total - count, total, skippedNames };
  }

  /** Katalog ro'yxati, ixtiyoriy qidiruv (nom yoki barcode bo'yicha) */
  
  findAll(search?: string) {
    const where: Prisma.ProductWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search } },
          ],
        }
      : {};

    return this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Kassa uchun nom YOKI barcode bo'yicha qidiruv (LIKE, registrga befarq).
   * Har bir dori uchun joriy (FEFO) sotuv narxi va umumiy qoldiq qaytariladi —
   * `findByBarcode` bilan bir xil shakl, lekin ko'p natija (qisman nom uchun).
   */
  async searchForPos(query: string, limit = 20) {
    const q = query.trim();
    if (!q) return [];

    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q } },
        ],
      },
      include: {
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return products.map((product) => {
      const totalStock = product.batches.reduce((sum, b) => sum + b.quantity, 0);
      const currentBatch = product.batches[0] ?? null;
      const packPrice = currentBatch ? currentBatch.sellPrice : null;
      return {
        ...product,
        totalStock, // donada
        packPrice,
        piecePrice: packPrice
          ? computePiecePrice(packPrice, product.unitsPerPack)
          : null,
      };
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { batches: { orderBy: { expiryDate: 'asc' } } },
    });
    if (!product) {
      throw new NotFoundException(`Dori topilmadi (id=${id})`);
    }
    return product;
  }

  /**
   * Skaner uchun: barcode bo'yicha dori + mavjud (qoldig'i > 0) partiyalar.
   * sellPrice — eng yaqin muddatli partiyadan olinadi (FEFO bilan mos).
   */
  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findUnique({
      where: { barcode },
      include: {
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });
    if (!product) {
      throw new NotFoundException(`Barcode topilmadi: ${barcode}`);
    }

    const totalStock = product.batches.reduce((sum, b) => sum + b.quantity, 0);
    const currentBatch = product.batches[0] ?? null;
    const packPrice = currentBatch ? currentBatch.sellPrice : null;

    return {
      ...product,
      totalStock, // donada
      packPrice,
      piecePrice: packPrice
        ? computePiecePrice(packPrice, product.unitsPerPack)
        : null,
    };
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.product.delete({ where: { id } });
  }
}
