import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Packetdagi bitta dori shabloni (yaratish/import uchun) */
export class PacketItemInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  form?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  unitsPerPack?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultCostPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;
}

/** Packetga dorilarni ommaviy qo'shish (Exceldan) */
export class ImportPacketItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PacketItemInputDto)
  items: PacketItemInputDto[];
}

/** Packetdagi bitta dorini tahrirlash (barchasi ixtiyoriy) */
export class UpdatePacketItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  form?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  unitsPerPack?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultCostPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;
}
