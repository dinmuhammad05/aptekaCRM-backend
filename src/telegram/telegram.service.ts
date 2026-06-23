import { Injectable, Logger } from '@nestjs/common';
import { endOfDay, startOfDay } from '../common/date';
import { computeSalesStats } from '../common/sales-stats';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Telegram bot orqali xabar yuborish (transport) va apteka uchun kunlik
 * savdo xulosasi matnini tayyorlash. Bot token `TELEGRAM_BOT_TOKEN` env'dan
 * olinadi; token yo'q bo'lsa hamma narsa "no-op" (xato bermaydi).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN ?? '';

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return this.token.length > 0;
  }

  /** Berilgan chatga xabar yuboradi. Muvaffaqiyat — true. */
  async send(chatId: string, text: string): Promise<boolean> {
    if (!this.token || !chatId) return false;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        },
      );
      if (!res.ok) {
        this.logger.warn(`Telegram yuborilmadi (HTTP ${res.status})`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.warn(`Telegram xatosi: ${String(e)}`);
      return false;
    }
  }

  /** Bitta apteka uchun bugungi savdo xulosasi (HTML matn) */
  async dailySummaryText(pharmacyId: number): Promise<string> {
    const now = new Date();
    const sales = await this.prisma.sale.findMany({
      where: {
        pharmacyId,
        createdAt: { gte: startOfDay(now), lte: endOfDay(now) },
      },
      include: { items: { include: { batch: true, product: true } } },
    });
    const stats = computeSalesStats(sales);
    const lowCount = await this.lowStockCount(pharmacyId);

    return [
      `<b>📊 Kunlik xulosa — ${now.toLocaleDateString('ru-RU')}</b>`,
      `Savdo: <b>${stats.revenue}</b>`,
      `Foyda: <b>${stats.profit}</b>`,
      `Sotuvlar: <b>${stats.salesCount}</b>`,
      lowCount > 0 ? `⚠️ Kam qolgan dorilar: <b>${lowCount}</b>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async lowStockCount(pharmacyId: number): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: { pharmacyId, minStock: { gt: 0 } },
      select: {
        minStock: true,
        batches: { where: { quantity: { gt: 0 } }, select: { quantity: true } },
      },
    });
    return products.filter(
      (p) => p.batches.reduce((s, b) => s + b.quantity, 0) <= p.minStock,
    ).length;
  }
}
