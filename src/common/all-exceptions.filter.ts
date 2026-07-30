import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const lang = (request.headers['x-lang'] as string) || 'uz';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Ichki server xatosi';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
      
      // If NestJS wrapped it in { message: ... }
      if (typeof message === 'object' && message !== null && 'message' in message) {
        const msg = (message as any).message;
        
        // Handle custom structured error { key: '...', args: {...} }
        if (typeof msg === 'object' && msg !== null && 'key' in msg) {
          if (msg.key === 'INSUFFICIENT_STOCK') {
            const { product, available, required, unit } = msg.args;
            if (lang === 'ru') {
              const u = unit === 'pack' ? 'уп.' : 'шт.';
              message = `Недостаточно годного остатка для "${product}" (в наличии: ${available} ${u}, нужно: ${required} ${u}). Просроченные партии не продаются.`;
            } else if (lang === 'tg') {
              const u = unit === 'pack' ? 'баста' : 'дона';
              message = `Барои "${product}" бақияи кофӣ нест (мавҷуд: ${available} ${u}, лозим: ${required} ${u}). Партияҳои муҳлаташон гузашта фурӯхта намешаванд.`;
            } else {
              const u = unit === 'pack' ? 'pachka' : 'dona';
              message = `"${product}" uchun yaroqli qoldiq yetarli emas (mavjud: ${available} ${u}, kerak: ${required} ${u}). Muddati o'tgan partiyalar sotilmaydi.`;
            }
          } else if (msg.key === 'SHIFT_CLOSED') {
            if (lang === 'ru') message = 'Сначала откройте смену — для продажи нужна открытая смена';
            else if (lang === 'tg') message = 'Аввал сменаро кушоед — барои фурӯш сменаи кушод лозим аст';
            else message = 'Avval smenani oching — sotuv uchun ochiq smena kerak';
          }
        }
      }
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2002'
    ) {
      status = HttpStatus.CONFLICT;
      if (lang === 'ru') message = 'Такое значение уже существует (дубликат)';
      else if (lang === 'tg') message = 'Чунин арзиш аллакай вуҷуд дорад (такрор)';
      else message = 'Bunday qiymat allaqachon mavjud (takrorlanish)';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `${request.method} ${request.url} -> ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
