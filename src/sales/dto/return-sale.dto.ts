import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnItemDto {
  @IsInt()
  @IsPositive()
  saleItemId: number;

  @IsInt()
  @Min(1)
  quantity: number; // qaytariladigan birlik soni (sotuv birligida)
}

export class ReturnSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}
