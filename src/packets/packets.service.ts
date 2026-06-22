import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePacketDto, UpdatePacketDto } from './dto/packet.dto';
import {
  ImportPacketItemsDto,
  UpdatePacketItemDto,
} from './dto/packet-item.dto';

/** Nomni dedupe uchun normallashtirish (katalog importi bilan bir xil) */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Nomdagi "№N" dan pachka hajmini aniqlaydi (topilmasa undefined → 1) */
function extractUnitsPerPack(name: string): number | undefined {
  const m = name.match(/№\s*(\d{1,4})/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 1000 ? n : undefined;
}

@Injectable()
export class PacketsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- SUPERADMIN: packetlarni boshqarish ----

  /** Barcha packetlar + dorilar soni */
  async listPackets() {
    return this.prisma.packet.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
  }

  /** Bitta packet + dorilari (nom bo'yicha tartiblangan) */
  async getPacket(id: number) {
    const packet = await this.prisma.packet.findUnique({
      where: { id },
      include: { items: { orderBy: { name: 'asc' } } },
    });
    if (!packet) {
      throw new NotFoundException(`Packet topilmadi (id=${id})`);
    }
    return packet;
  }

  /**
   * Bitta packet + dorilari (sahifalangan). `search` berilsa nom/barcode
   * bo'yicha filtrlaydi. Javobda joriy sahifa dorilari va umumiy son (`total`).
   */
  async getPacketPaged(
    id: number,
    opts: { take?: number; skip?: number; search?: string },
  ) {
    const packet = await this.prisma.packet.findUnique({ where: { id } });
    if (!packet) {
      throw new NotFoundException(`Packet topilmadi (id=${id})`);
    }
    const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
    const skip = Math.max(opts.skip ?? 0, 0);
    const q = opts.search?.trim();
    const where: Prisma.PacketItemWhereInput = {
      packetId: id,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { barcode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.packetItem.findMany({
        where,
        orderBy: { name: 'asc' },
        take,
        skip,
      }),
      this.prisma.packetItem.count({ where }),
    ]);
    return { ...packet, items, total };
  }

  createPacket(dto: CreatePacketDto) {
    return this.prisma.packet.create({ data: dto });
  }

  async updatePacket(id: number, dto: UpdatePacketDto) {
    await this.getPacket(id);
    return this.prisma.packet.update({ where: { id }, data: dto });
  }

  async deletePacket(id: number) {
    await this.getPacket(id);
    return this.prisma.packet.delete({ where: { id } });
  }

  /**
   * Packetga dorilarni ommaviy qo'shish (Exceldan). Nom bo'yicha dedupe —
   * mavjud dorilar va fayl ichidagi takrorlar tashlanadi.
   */
  async addItems(packetId: number, dto: ImportPacketItemsDto) {
    await this.getPacket(packetId);

    const existing = await this.prisma.packetItem.findMany({
      where: { packetId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((i) => normalizeName(i.name)));
    const seen = new Set<string>();

    const toCreate: {
      packetId: number;
      name: string;
      barcode?: string;
      manufacturer?: string;
      form?: string;
      unit: string;
      unitsPerPack: number;
      defaultCostPrice?: number;
      sellPrice?: number;
      quantity: number;
    }[] = [];

    for (const item of dto.items) {
      const key = normalizeName(item.name);
      if (!key) continue;
      if (existingNames.has(key) || seen.has(key)) continue;
      seen.add(key);
      const name = item.name.trim();
      toCreate.push({
        packetId,
        name,
        barcode: item.barcode?.trim() || undefined,
        manufacturer: item.manufacturer,
        form: item.form,
        unit: item.unit ?? 'dona',
        unitsPerPack:
          item.unitsPerPack ?? extractUnitsPerPack(name) ?? 1,
        defaultCostPrice: item.defaultCostPrice,
        sellPrice: item.sellPrice,
        quantity: item.quantity ?? 0,
      });
    }

    const { count } = await this.prisma.packetItem.createMany({
      data: toCreate,
    });
    return { created: count, skipped: dto.items.length - count };
  }

  async updateItem(packetId: number, itemId: number, dto: UpdatePacketItemDto) {
    const { count } = await this.prisma.packetItem.updateMany({
      where: { id: itemId, packetId },
      data: dto,
    });
    if (count === 0) {
      throw new NotFoundException(`Dori topilmadi (id=${itemId})`);
    }
    return this.prisma.packetItem.findUnique({ where: { id: itemId } });
  }

  async deleteItem(packetId: number, itemId: number) {
    const { count } = await this.prisma.packetItem.deleteMany({
      where: { id: itemId, packetId },
    });
    if (count === 0) {
      throw new NotFoundException(`Dori topilmadi (id=${itemId})`);
    }
    return { ok: true };
  }

  /** Packetdagi barcha dorilar qoldig'ini 0 ga aylantirish */
  async zeroQuantities(packetId: number) {
    await this.getPacket(packetId);
    const { count } = await this.prisma.packetItem.updateMany({
      where: { packetId },
      data: { quantity: 0 },
    });
    return { updated: count };
  }

  // ---- APTEKA ADMINI: packetni o'ziga klonlash ----

  /** Apteka tanlashi uchun mavjud packetlar (dorilar soni bilan) */
  async listAvailable() {
    return this.prisma.packet.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  /**
   * Packetni joriy aptekaga klonlaydi: har bir dori shabloni Product sifatida
   * ko'chiriladi (barcode + unitsPerPack + tavsiya kelish narxi), QOLDIQ 0 dan
   * boshlanadi (partiya ochilmaydi). Nom bo'yicha dedupe — aptekada allaqachon
   * bor dorilar tashlanadi. Barcode to'qnashsa (aptekada band) barcode'siz
   * ko'chiriladi.
   */
  async applyToPharmacy(packetId: number) {
    const packet = await this.prisma.packet.findUnique({
      where: { id: packetId },
      include: { items: { orderBy: { name: 'asc' } } },
    });
    if (!packet) {
      throw new NotFoundException(`Packet topilmadi (id=${packetId})`);
    }
    const pharmacyId = requirePharmacyId();

    // Aptekadagi mavjud dorilar (tenant filtri avtomatik)
    const existing = await this.prisma.product.findMany({
      select: { name: true, barcode: true },
    });
    const existingNames = new Set(existing.map((p) => normalizeName(p.name)));
    const usedBarcodes = new Set(
      existing.map((p) => p.barcode).filter((b): b is string => !!b),
    );
    const seenNames = new Set<string>();

    const toCreate: {
      pharmacyId: number;
      name: string;
      barcode: string | null;
      manufacturer: string | null;
      form: string | null;
      unit: string;
      unitsPerPack: number;
      defaultCostPrice: typeof packet.items[number]['defaultCostPrice'];
    }[] = [];

    for (const it of packet.items) {
      const key = normalizeName(it.name);
      if (!key || existingNames.has(key) || seenNames.has(key)) continue;
      seenNames.add(key);

      // Barcode aptekada band bo'lsa — to'qnashuvni oldini olish uchun tashlaymiz
      let barcode = it.barcode ?? null;
      if (barcode && usedBarcodes.has(barcode)) barcode = null;
      if (barcode) usedBarcodes.add(barcode);

      toCreate.push({
        pharmacyId,
        name: it.name,
        barcode,
        manufacturer: it.manufacturer,
        form: it.form,
        unit: it.unit,
        unitsPerPack: it.unitsPerPack,
        defaultCostPrice: it.defaultCostPrice,
      });
    }

    const { count } = await this.prisma.product.createMany({ data: toCreate });
    return {
      created: count,
      skipped: packet.items.length - count,
      total: packet.items.length,
    };
  }
}
