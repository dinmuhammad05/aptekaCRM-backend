import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOW_BLOCKED_KEY } from './allow-blocked.decorator';
import type { AuthUser } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * SaaS obuna nazorati: bloklangan aptekaning foydalanuvchilari ma'lumotga kira
 * olmaydi. SUPERADMIN va `@Public()`/`@AllowBlocked()` endpointlar ozod.
 *
 * Blok holati admin tomonidan qo'lda o'rnatiladi (obuna tugashi avtomatik
 * bloklamaydi — admin ko'rib qaror qiladi). Bu guard shunchaki backstop.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowBlocked = this.reflector.getAllAndOverride<boolean>(
      ALLOW_BLOCKED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowBlocked) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) return true; // JwtAuthGuard allaqachon hal qilgan

    // SaaS egasi va aptekaga bog'lanmagan foydalanuvchilar — ozod
    if (user.role === 'SUPERADMIN' || user.pharmacyId == null) return true;

    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: user.pharmacyId },
      select: { status: true },
    });
    if (!pharmacy || pharmacy.status === 'BLOCKED') {
      throw new ForbiddenException(
        "Apteka obunasi bloklangan. Iltimos, administrator bilan bog'laning.",
      );
    }
    return true;
  }
}
