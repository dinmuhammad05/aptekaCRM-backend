import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global modul — PrismaService butun ilova bo'ylab inject qilinadi.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
