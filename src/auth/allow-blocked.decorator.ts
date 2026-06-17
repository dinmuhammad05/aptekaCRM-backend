import { SetMetadata } from '@nestjs/common';

/**
 * Bloklangan apteka uchun ham ochiq endpoint (masalan /auth/me) — foydalanuvchi
 * o'z holatini ko'rib, "obuna tugagan" ekranini ko'rsata olishi uchun.
 */
export const ALLOW_BLOCKED_KEY = 'allowBlocked';
export const AllowBlocked = () => SetMetadata(ALLOW_BLOCKED_KEY, true);
