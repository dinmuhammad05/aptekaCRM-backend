import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // O'rnatilgan body-parser o'chiriladi — limitni o'zimiz belgilaymiz
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Katalog importi minglab dori yuboradi — standart 100kb limit yetmaydi
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Barcha so'rovlar uchun /api prefiksi
  app.setGlobalPrefix('api');

  // DTO validatsiya: noma'lum maydonlarni rad etadi, tip o'zgartiradi
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Yagona xato formati va loglash
  app.useGlobalFilters(new AllExceptionsFilter());

  // Frontend bilan ishlash uchun CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Server ishga tushdi: http://localhost:${port}/api`);
}

void bootstrap();
