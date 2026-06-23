import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Yangi mijoz (doimiy xaridor) */
export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
