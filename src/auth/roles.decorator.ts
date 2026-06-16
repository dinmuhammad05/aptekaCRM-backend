import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Endpoint uchun ruxsat etilgan rollar (bo'sh bo'lsa — har qanday foydalanuvchi) */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
