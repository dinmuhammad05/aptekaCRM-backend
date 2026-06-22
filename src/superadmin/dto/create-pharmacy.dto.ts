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

/** Yangi apteka (tenant) + uning admin foydalanuvchisini yaratish */
export class CreatePharmacyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /** Obuna tugash sanasi (ISO) — null/bo'sh = muddatsiz */
  @IsOptional()
  @IsDateString()
  subscriptionEndsAt?: string;

  /** Oylik obuna narxi (SaaS daromadi uchun) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Apteka admini (login uchun)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  adminUsername!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(100)
  adminPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  adminName?: string;
}
