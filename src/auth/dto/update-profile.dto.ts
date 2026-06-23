import { IsOptional, IsString, MaxLength } from 'class-validator';

/** O'z profilini yangilash (barcha rollar) */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /**
   * Profil rasmi — base64 data URL yoki null (o'chirish). Mijoz tomonida 256px
   * kvadrat JPEG'ga siqiladi (~30-60 KB), shu sabab cheklov ~300 KB: har bir
   * /auth/me javobida (sessiya tiklashda) katta blob yuborilmasligi uchun.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300000)
  avatarUrl?: string | null;
}
