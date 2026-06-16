import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import type { AuthUser } from './current-user.decorator';

/** `@Roles(...)` bilan belgilangan endpointlar uchun rolni tekshiradi. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenException("Bu amal uchun ruxsat yo'q");
    }
    return true;
  }
}
