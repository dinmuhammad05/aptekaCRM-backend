import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentType, SaleUnit } from '@prisma/client';

/** Chegirma turi: foiz (%) yoki to'g'ridan-to'g'ri summa (so'm) */
export type DiscountType = 'PERCENT' | 'AMOUNT';

export class SaleItemDto {
  @IsInt()
  @IsPositive()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number; // sotilgan birlikdagi son (pachka soni yoki dona soni)

  @IsEnum(SaleUnit)
  unit: SaleUnit; // PACK yoki PIECE

  @IsOptional()
  @IsNumber()
  @Min(0)
  customPrice?: number; // Kassir o'zgartirgan narx
}

export class CreateSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsIn(['PERCENT', 'AMOUNT'])
  discountType?: DiscountType; // chegirma turi (kiritilsa discountValue ham kerak)

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number; // PERCENT bo'lsa foiz, AMOUNT bo'lsa so'm

  /** Nasiya (qarz) savdosida mijoz; berilmasa — oddiy to'liq to'langan savdo */
  @IsOptional()
  @IsInt()
  @IsPositive()
  customerId?: number;

  /**
   * Sotuv paytida to'langan summa (so'm). Faqat `customerId` bilan ma'noli:
   * qarz = total - paid. Berilmasa va mijoz bo'lsa — 0 (to'liq nasiya).
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paid?: number;
}
