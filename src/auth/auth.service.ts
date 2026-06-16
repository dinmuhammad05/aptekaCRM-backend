import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Ilova ishga tushganda, agar foydalanuvchilar umuman bo'lmasa, boshlang'ich
   * admin yaratiladi (env: ADMIN_USERNAME/ADMIN_PASSWORD). Idempotent — mavjud
   * ma'lumotga tegmaydi (destruktiv seed ishlatilmaydi).
   */
  async onModuleInit(): Promise<void> {
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const username = process.env.ADMIN_USERNAME ?? 'admin';
    const password = process.env.ADMIN_PASSWORD ?? 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.create({
      data: { username, passwordHash, name: 'Administrator', role: 'ADMIN' },
    });
    this.logger.log(`Boshlang'ich admin yaratildi (login: ${username})`);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    };
  }

  async me(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, name: true, role: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
