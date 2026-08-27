import { setDefaultResultOrder } from 'dns';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import * as cookieParser from 'cookie-parser';
import { Model } from 'mongoose';

// Node's built-in fetch (undici) resolves and races both A/AAAA records by default. On some hosts/
// containers, outbound IPv6 is present in DNS but not actually routable -- every fetch() call then
// eats a real connect timeout on the (dead) IPv6 address before it ever falls back to IPv4, which
// can make it fail outright rather than just being slow (confirmed directly against this app's own
// Cloudinary account: fetch() consistently threw ETIMEDOUT/ENETUNREACH while curl to the identical
// URL succeeded immediately). This affects every fetch() in the app -- StorageService.getObject()'s
// Cloudinary fallback, PostsService.streamAttachment()'s chunk reassembly, link previews, etc. --
// so it's fixed once here rather than per call site. IPv4-first is also simply the safer default
// for a typical server host regardless of this specific bug.
setDefaultResultOrder('ipv4first');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { corsOriginValidator } from './common/cors-origin';
import { User, UserDocument } from './users/schemas/user.schema';
import { SELECTABLE_DEPARTMENTS } from './common/enums/department.enum';
import { ACADEMIC_YEARS } from './common/enums/academic-year.enum';

// One-off, idempotent: grandfathers any pre-existing account (created before this auth overhaul)
// as verified, and reconciles MongoDB's indexes with the current schema -- critical because the
// old `email` field had a *non-sparse* unique index; without dropping it, the second-ever new
// registration after this deploy would fail with a duplicate-key error on the now-unused field.
//
// Also: `department` used to be a free-text profile field; now it's a fixed 3-value enum. Any
// existing value that isn't one of the three valid enum values gets nulled out here -- narrow,
// targeted (`$nin` on the exact valid list, `$ne: null` so untouched accounts are left alone),
// never a blanket rewrite of the whole collection. Same story for `academicYear`, which used to be
// free text (e.g. "السنة الثالثة") before it became a fixed AcademicYear enum for feed filtering.
async function runStartupMigrations(userModel: Model<UserDocument>) {
  await userModel
    .updateMany({ collegeEmailVerifiedAt: { $exists: false } }, [{ $set: { collegeEmailVerifiedAt: '$createdAt' } }])
    .exec();
  await userModel
    .updateMany({ department: { $nin: [...SELECTABLE_DEPARTMENTS, null] } }, { $set: { department: null } })
    .exec();
  await userModel
    .updateMany({ academicYear: { $nin: [...ACADEMIC_YEARS, null] } }, { $set: { academicYear: null } })
    .exec();
  await userModel.syncIndexes();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Render (like most PaaS) terminates TLS at a reverse proxy in front of the app, so without
  // this req.ip / the throttler's rate-limit key would resolve to the proxy's internal address
  // for every request instead of the real client IP.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  await runStartupMigrations(app.get<Model<UserDocument>>(getModelToken(User.name)));

  app.use(cookieParser());

  // Strip unknown fields and auto-transform payloads (e.g. "2430525" -> number where needed)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: corsOriginValidator,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${port}/api`);
}
bootstrap();
