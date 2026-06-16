import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Mavjud partiyani (Batch) to'g'rilash — barcha maydonlar ixtiyoriy.
 * `quantity` DONADA beriladi (frontend pachka+dona'dan hisoblab yuboradi).
 */
export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number; // joriy qoldiq (donada)

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice?: number;
}
