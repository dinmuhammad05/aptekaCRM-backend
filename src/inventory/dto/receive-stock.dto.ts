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
  @IsString()
  @MaxLength(64)
  batchNumber?: string;

  @IsDateString()
  expiryDate: string;

  @IsInt()
  @Min(1)
  packs: number; // nechta pachka keldi (donaga avtomatik o'tkaziladi)

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice: number;
}
