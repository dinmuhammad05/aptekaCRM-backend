import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/** JWT'dan olingan joriy foydalanuvchi */
export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  /** Tegishli apteka IDsi. SUPERADMIN uchun null. */
  pharmacyId: number | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
