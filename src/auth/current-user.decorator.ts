import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/** JWT'dan olingan joriy foydalanuvchi */
export interface AuthUser {
  id: number;
  username: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
