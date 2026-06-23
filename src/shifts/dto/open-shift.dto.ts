import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Smena ochish — boshlang'ich kassa naqdi bilan */
export class OpenShiftDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCash?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
