import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Apteka Telegram chat ID'sini o'rnatish (bo'sh = o'chirish) */
export class SetTelegramDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chatId?: string | null;
}
