import { IsOptional, IsString, MaxLength } from 'class-validator';

/** O'z profilini yangilash (barcha rollar) */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Profil rasmi — base64 data URL yoki null (o'chirish). Kichik siqilган rasm. */
  @IsOptional()
  @IsString()
  @MaxLength(1500000)
  avatarUrl?: string | null;
}
