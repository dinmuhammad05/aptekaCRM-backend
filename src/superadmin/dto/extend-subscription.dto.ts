import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Obunani N oyga uzaytirish (1..36) */
export class ExtendSubscriptionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months!: number;
}
