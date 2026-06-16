import { IsInt, IsPositive, Min } from 'class-validator';

/**
 * Inventarizatsiya — dorining haqiqiy qoldig'ini kiritib, tizim partiyalarni
 * avtomatik to'g'rilaydi. `quantity` — haqiqiy umumiy qoldiq (DONADA).
 */
export class AdjustStockDto {
  @IsInt()
  @IsPositive()
  productId: number;

  @IsInt()
  @Min(0)
  quantity: number; // haqiqiy umumiy qoldiq (donada)
}
