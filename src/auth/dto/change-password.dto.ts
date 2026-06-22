import { IsString, MaxLength, MinLength } from 'class-validator';

/** O'z parolini o'zgartirish */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(100)
  newPassword!: string;
}
