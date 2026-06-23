import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Smenani yopish — sanab chiqilgan naqd kassa bilan */
export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closingCash!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
