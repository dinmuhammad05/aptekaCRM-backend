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
}
