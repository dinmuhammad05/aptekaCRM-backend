import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { requirePharmacyId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { SetTelegramDto } from './dto/set-telegram.dto';
import { TelegramService } from './telegram.service';

/** Telegram sozlamalari (apteka) — faqat ADMIN */
@Roles(Role.ADMIN)
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  @Get()
  async status() {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: requirePharmacyId() },
      select: { telegramChatId: true },
    });
    return {
      configured: this.telegram.isConfigured(),
      chatId: pharmacy?.telegramChatId ?? null,
    };
  }

  @Patch()
  async setChatId(@Body() dto: SetTelegramDto) {
    const chatId = dto.chatId?.trim() || null;
    await this.prisma.pharmacy.update({
      where: { id: requirePharmacyId() },
      data: { telegramChatId: chatId },
    });
    return { chatId };
  }

  @Post('test')
  async test() {
    const chatId = await this.requireChatId();
    const sent = await this.telegram.send(
      chatId,
      '✅ Apteka CRM — Telegram ulanishi ishlayapti.',
    );
    return { sent };
  }

  @Post('summary')
  async summaryNow() {
    const chatId = await this.requireChatId();
    const text = await this.telegram.dailySummaryText(requirePharmacyId());
    const sent = await this.telegram.send(chatId, text);
    return { sent };
  }

  private async requireChatId(): Promise<string> {
    if (!this.telegram.isConfigured()) {
      throw new BadRequestException(
        "Serverda TELEGRAM_BOT_TOKEN o'rnatilmagan",
      );
    }
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: requirePharmacyId() },
      select: { telegramChatId: true },
    });
    if (!pharmacy?.telegramChatId) {
      throw new BadRequestException('Avval Telegram chat ID kiriting');
    }
    return pharmacy.telegramChatId;
  }
}
