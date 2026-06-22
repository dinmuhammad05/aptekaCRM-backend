import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Apteka foydalanuvchisining login/parol/ismini yangilash (superadmin) */
export class UpdatePharmacyUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
