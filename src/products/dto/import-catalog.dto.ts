import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Katalog importining bitta qatori: faqat dori kartochkasi (partiya/qoldiq emas).
 * `defaultCostPrice` — keyinchalik prixodda taklif qilinadigan kelish narxi.
 */
export class ImportCatalogItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultCostPrice?: number;
}

/** Boshlang'ich katalogni (3767+ dori) ommaviy yuklash */
export class ImportCatalogDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => ImportCatalogItemDto)
  items: ImportCatalogItemDto[];
}
