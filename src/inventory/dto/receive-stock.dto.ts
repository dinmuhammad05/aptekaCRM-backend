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

/** Prixod — yangi partiya qabul qilish */
export class ReceiveStockDto {
  @IsInt()
  @IsPositive()
  productId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  supplierId?: number; // qaysi ta'minotchidan keldi (ixtiyoriy — qarzga qo'shiladi)

  @IsOptional()
  @IsString()
  @MaxLength(255)
  batchNumber?: string;

  @IsDateString()
  expiryDate: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  packs?: number; // nechta pachka keldi (donaga avtomatik o'tkaziladi)

  @IsOptional()
  @IsInt()
  @Min(0)
  pieces?: number; // pachkadan tashqari ochiq dona soni

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice: number;
}
