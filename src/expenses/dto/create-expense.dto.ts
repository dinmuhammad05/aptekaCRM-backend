import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Operatsion xarajat kiritish */
export class CreateExpenseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  category!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Xarajat sanasi (ISO) — berilmasa bugun */
  @IsOptional()
  @IsDateString()
  spentAt?: string;
}
