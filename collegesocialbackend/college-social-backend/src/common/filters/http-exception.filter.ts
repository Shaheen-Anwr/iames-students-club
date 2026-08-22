import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // exception.getResponse() for a NestJS-thrown HttpException is either a plain string, or an
    // object shaped { statusCode, message, error } (this is what ValidationPipe and every
    // `throw new XException('...')` call in this codebase actually produce) -- unwrap that inner
    // `message` rather than nesting the whole object under `message` again, or the frontend's
    // error-extraction (api.ts's extractMessage) can never find a string/array to display and
    // silently falls back to a generic "request failed" message instead of the real one.
    let message: unknown = 'حدث خطأ في الخادم';
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      message = typeof res === 'object' && res !== null && 'message' in res ? (res as { message: unknown }).message : res;
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
