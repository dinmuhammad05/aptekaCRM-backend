import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Boshlang'ich qoldiq (inventarizatsiya) — bitta dori uchun: ixtiyoriy barcode
 * dori kartasiga yoziladi va bitta partiya (prixod) ochiladi. `packs` donaga
 * `unitsPerPack` orqali o'tkaziladi. `expiryDate`/`costPrice` ixtiyoriy.
 */
export class InitialStockDto {
  @IsInt()
  @IsPositive()
  productId: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsInt()
  @Min(1)
  packs: number; // nechta pachka bor (donaga avtomatik o'tkaziladi)

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice: number; // pachka sotuv narxi

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number; // pachka kelish narxi (bo'lmasa — defaultCostPrice yoki 0)

  @IsOptional()
  @IsDateString()
  expiryDate?: string; // bo'lmasa — bugundan +2 yil
}
