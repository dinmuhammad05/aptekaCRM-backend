import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { startOfDay } from '../common/date';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

/**
 * Kunlik savdo xulosasini avtomatik yuboradi (qo'shimcha kutubxonasiz — har 30
 * daqiqada tekshiradi). `TELEGRAM_SUMMARY_HOUR` (standart 20) — yuborish soati.
 * Token o'rnatilmagan bo'lsa ishga tushmaydi. Bir kunlik xulosa bir marta
 * yuboriladi (xotirada belgilanadi).
 */
@Injectable()
export class TelegramScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly sentOn = new Map<number, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  onModuleInit(): void {
    if (!this.telegram.isConfigured()) return;
    this.timer = setInterval(() => void this.tick(), 30 * 60 * 1000);
    this.logger.log('Telegram kunlik xulosa rejalashtiruvchisi yoqildi');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const sendHour = Number(process.env.TELEGRAM_SUMMARY_HOUR ?? 20);
    const now = new Date();
    if (now.getHours() < sendHour) return;
    const today = startOfDay(now).toISOString().slice(0, 10);

    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { telegramChatId: { not: null }, status: 'ACTIVE' },
      select: { id: true, telegramChatId: true },
    });
    for (const p of pharmacies) {
      if (!p.telegramChatId || this.sentOn.get(p.id) === today) continue;
      const text = await this.telegram.dailySummaryText(p.id);
      const ok = await this.telegram.send(p.telegramChatId, text);
      if (ok) this.sentOn.set(p.id, today);
    }
  }
}
