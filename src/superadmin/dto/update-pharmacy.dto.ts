import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
