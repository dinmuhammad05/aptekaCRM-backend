import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computePiecePrice } from '../common/pricing';
import { requirePharmacyId } from '../common/tenant-context';
import { buildSearchConditions } from '../common/search';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportCatalogDto } from './dto/import-catalog.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/** Nomni moslashtirish uchun normallashtirish (katalog dedupe uchun) */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Dori nomidan pachkadagi dona sonini aniqlaydi: "№N" belgisi (masalan
 * "Актовегин амп 10мл №5" → 5). Topilmasa undefined (default 1 ishlatiladi).
 * "10мл" kabi hajm bilan adashtirmaslik uchun faqat № belgisiga tayanamiz.
 */
function extractUnitsPerPack(name: string): number | undefined {
  const m = name.match(/№\s*(\d{1,4})/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 1000 ? n : undefined;
}

/** Bugun (yarim tunda) — muddati o'tgan partiyalarni ajratish uchun */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: { ...dto, pharmacyId: requirePharmacyId() },
    });
  }

  /**
   * Boshlang'ich katalogni ommaviy yuklash (faqat dori kartochkalari, partiya emas).
   * Bitta `createMany` bilan kiritiladi — 3767+ qator uchun ham tez, tranzaksiya
   * loopi yo'q (timeout muammosi bo'lmaydi). `Product.name` unique emas, shu sabab
   * dublikatlar app darajasida (mavjud nomlar + fayl ichi) tashlanadi.
   */
  async importCatalog(dto: ImportCatalogDto) {
    const total = dto.items.length;
    const pharmacyId = requirePharmacyId();

    // Bazadagi mavjud nomlar (normallashtirilgan) — qaytadan kiritmaslik uchun
    const existing = await this.prisma.product.findMany({
      select: { name: true },
    });
    const existingNames = new Set(existing.map((p) => normalizeName(p.name)));

    const seen = new Set<string>();
    const toCreate: {
      pharmacyId: number;
      name: string;
      defaultCostPrice?: number;
      unitsPerPack?: number;
    }[] = [];
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
      const name = item.name.trim();
      toCreate.push({
        pharmacyId,
        name,
        defaultCostPrice: item.defaultCostPrice,
        // Nomdagi "№N" dan pachka hajmi avtomatik aniqlanadi (topilmasa 1)
        unitsPerPack: extractUnitsPerPack(name),
      });
    }

    const { count } = await this.prisma.product.createMany({ data: toCreate });

    // O'tkazib yuborilgan (dublikat) dorilar haqida kassir uchun xabar yoziladi
    if (skippedNames.length > 0) {
      await this.prisma.notification.createMany({
        data: skippedNames.map((name) => ({
          pharmacyId,
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
      ? { OR: buildSearchConditions(search) }
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
        OR: buildSearchConditions(q),
      },
      include: {
        batches: {
          // Faqat yaroqli (muddati o'tmagan) partiyalar — POS sotiladigan qoldiq
          where: { quantity: { gt: 0 }, expiryDate: { gte: startOfToday() } },
          orderBy: { expiryDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return products.map((product) => {
      const totalStock = product.batches.reduce(
        (sum, b) => sum + b.quantity,
        0,
      );
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

  async quickSelectForPos() {
    const products = await this.prisma.product.findMany({
      where: { isQuickSelect: true },
      include: {
        batches: {
          where: { quantity: { gt: 0 }, expiryDate: { gte: startOfToday() } },
          orderBy: { expiryDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => {
      const totalStock = product.batches.reduce((sum, b) => sum + b.quantity, 0);
      const currentBatch = product.batches[0] ?? null;
      const packPrice = currentBatch ? currentBatch.sellPrice : null;
      return {
        ...product,
        totalStock, // donada
        packPrice,
        piecePrice: packPrice ? computePiecePrice(packPrice, product.unitsPerPack) : null,
      };
    });
  }

  /**
   * Berilgan dorining analoglari (o'rnini bosuvchilari). Gibrid guruhlash:
   *  - `activeIngredient` (ta'sir moddasi) to'ldirilgan bo'lsa — o'sha bo'yicha;
   *  - to'ldirilmagan bo'lsa — dori nomining asosidan (birinchi so'z).
   * POS bilan bir xil shaklda (narx + qoldiq) qaytadi, zaxirada borlari oldinda.
   */
  async analogs(id: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Dori topilmadi (id=${id})`);
    }
    const key = this.analogKey(product);
    if (!key) return [];

    const products = await this.prisma.product.findMany({
      where: {
        id: { not: id },
        OR: [
          { activeIngredient: { equals: key, mode: 'insensitive' } },
          { name: { startsWith: key, mode: 'insensitive' } },
        ],
      },
      include: {
        batches: {
          where: { quantity: { gt: 0 }, expiryDate: { gte: startOfToday() } },
          orderBy: { expiryDate: 'asc' },
        },
      },
      take: 50,
    });

    return products
      .map((p) => {
        const totalStock = p.batches.reduce((sum, b) => sum + b.quantity, 0);
        const currentBatch = p.batches[0] ?? null;
        const packPrice = currentBatch ? currentBatch.sellPrice : null;
        return {
          ...p,
          totalStock,
          packPrice,
          piecePrice: packPrice
            ? computePiecePrice(packPrice, p.unitsPerPack)
            : null,
        };
      })
      // Zaxirada borlari oldinda (POS'da darrov taklif qilinsin)
      .sort((a, b) => b.totalStock - a.totalStock);
  }

  /**
   * Analoglarni guruhlash kaliti: ta'sir moddasi (bo'lsa) yoki dori nomining
   * birinchi so'zi (bo'shliq/raqam/verguldan oldingi), kichik harflarda.
   */
  private analogKey(p: {
    name: string;
    activeIngredient: string | null;
  }): string {
    const ing = p.activeIngredient?.trim().toLowerCase();
    if (ing) return ing;
    return p.name.trim().toLowerCase().split(/[\s,0-9]/)[0] ?? '';
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
    // barcode endi apteka ichida unique (global emas) — findFirst ishlatamiz;
    // tenant filtri Prisma middleware orqali avtomatik qo'shiladi
    let product = await this.prisma.product.findFirst({
      where: { barcode },
      include: {
        batches: {
          where: { quantity: { gt: 0 }, expiryDate: { gte: startOfToday() } },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!product && barcode.length > 5) {
      product = await this.prisma.product.findFirst({
        where: { barcode: { contains: barcode } },
        include: {
          batches: {
            where: { quantity: { gt: 0 }, expiryDate: { gte: startOfToday() } },
            orderBy: { expiryDate: 'asc' },
          },
        },
      });
    }

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
