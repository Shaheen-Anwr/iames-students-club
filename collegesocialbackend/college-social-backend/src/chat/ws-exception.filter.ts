import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

// Nest's default gateway filter turns anything that isn't a WsException into a generic
// "Internal server error" -- so every carefully worded Arabic HttpException the services throw
// (blocked user, closed poll, admins-only pin...) reached the client as that useless string.
// This keeps the original message (first one, for validation arrays) and lets the rest fall
// through to the default handling.
@Catch()
export class WsHttpExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const raw =
        typeof response === 'string' ? response : ((response as { message?: unknown })?.message ?? exception.message);
      const message = Array.isArray(raw) ? String(raw[0] ?? exception.message) : String(raw);
      return super.catch(new WsException(message), host);
    }
    return super.catch(exception, host);
  }
}
