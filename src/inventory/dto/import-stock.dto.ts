import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Excel nakladnoyidan import qilinadigan bitta qator.
 * `productId` berilsa — mavjud doriga prixod qo'shiladi.
 * Aks holda yangi dori yaratiladi (`name` majburiy).
 */
export class ImportItemDto {
  // --- Mavjud dori (agar tanlangan bo'lsa) ---
  @IsOptional()
  @IsInt()
  @IsPositive()
  productId?: number;

  // --- Yangi dori maydonlari (productId yo'q bo'lsa) ---
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  form?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  unitsPerPack?: number;

  // --- Partiya (prixod) maydonlari ---
  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchNumber?: string;

  @IsDateString()
  expiryDate: string;

  @IsInt()
  @Min(1)
  packs: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice: number;
}

/** Excel nakladnoyini ommaviy import qilish */
export class ImportStockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportItemDto)
  items: ImportItemDto[];
}
