import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Ilova ishga tushganda, agar foydalanuvchilar umuman bo'lmasa, boshlang'ich
   * SUPERADMIN (SaaS egasi) yaratiladi (env: SUPERADMIN_USERNAME/PASSWORD).
   * SUPERADMIN aptekaga bog'lanmaydi (pharmacyId = null) va barcha aptekalarni
   * boshqaradi. Idempotent — mavjud ma'lumotga tegmaydi.
   */
  async onModuleInit(): Promise<void> {
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const username = process.env.SUPERADMIN_USERNAME ?? 'superadmin';
    const password = process.env.SUPERADMIN_PASSWORD ?? 'superadmin123';
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        name: 'Super Admin',
        role: 'SUPERADMIN',
        pharmacyId: null,
      },
    });
    this.logger.log(`Boshlang'ich SUPERADMIN yaratildi (login: ${username})`);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { pharmacy: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
      pharmacyId: user.pharmacyId,
    });
    return {
      token,
      user: this.publicUser(user),
    };
  }

  async me(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { pharmacy: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  /** O'z profilini (ism, avatar) yangilash — barcha rollar uchun */
  async updateProfile(id: number, dto: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
    });
    return this.me(id);
  }

  /** O'z parolini o'zgartirish — joriy parolni tekshirib */
  async changePassword(id: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException("Joriy parol noto'g'ri");
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
  }

  /** Frontendga yuboriladigan xavfsiz foydalanuvchi shakli (apteka holati bilan). */
  private publicUser(user: {
    id: number;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    role: string;
    pharmacyId: number | null;
    pharmacy: {
      id: number;
      name: string;
      status: string;
      subscriptionEndsAt: Date | null;
    } | null;
  }) {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      pharmacyId: user.pharmacyId,
      pharmacy: user.pharmacy
        ? {
            id: user.pharmacy.id,
            name: user.pharmacy.name,
            status: user.pharmacy.status,
            subscriptionEndsAt: user.pharmacy.subscriptionEndsAt,
          }
        : null,
    };
  }
}
