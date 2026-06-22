import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Apteka ma'lumotlari va obuna sanasini yangilash */
export class UpdatePharmacyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /** ISO sana yoki null (muddatsiz qilish uchun) */
  @IsOptional()
  @IsDateString()
  subscriptionEndsAt?: string | null;

  /** Oylik obuna narxi (SaaS daromadi uchun) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPrice?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
