import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Eng so'nggi xabarlar (standart 50 ta) */
  list(limit = 50) {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Bitta xabarni o'qildi deb belgilash */
  markRead(id: number) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  /** Barcha o'qilmagan xabarlarni o'qildi deb belgilash */
  async markAllRead() {
    await this.prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}
