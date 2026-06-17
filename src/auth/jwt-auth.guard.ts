import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global guard — har bir so'rovda JWT tokenni tekshiradi va `req.user` ni
 * to'ldiradi. `@Public()` bilan belgilangan endpointlar o'tkazib yuboriladi.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Tizimga kiring');
    }

    try {
      const payload = this.jwt.verify<{
        sub: number;
        username: string;
        role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
        pharmacyId: number | null;
      }>(header.slice(7));
      (req as Request & { user: unknown }).user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        pharmacyId: payload.pharmacyId ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Sessiya tugadi, qayta kiring');
    }
  }
}
