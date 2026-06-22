import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Yangi packet (shablon katalog) yaratish */
export class CreatePacketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/** Packet nomi/izohini yangilash (barchasi ixtiyoriy) */
export class UpdatePacketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
