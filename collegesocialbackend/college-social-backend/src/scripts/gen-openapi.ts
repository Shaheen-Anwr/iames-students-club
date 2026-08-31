import { writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';

// Boots the app (no HTTP listener) purely to reflect its routes + DTOs into an OpenAPI 3 spec,
// writes it to backend-root/openapi.json, and exits. The frontend's `npm run gen:api-types`
// reads that file to generate lib/api-types.ts. Run: `npm run gen:openapi` (which builds first).
//
// Needs the same MongoDB the app normally uses (MongooseModule.forRootAsync connects on init);
// nothing is written to the DB -- the app is closed immediately after the doc is built.
async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  // NOTE: the real server mounts everything under `/api` (main.ts setGlobalPrefix). The spec is
  // left prefix-less on purpose so its paths line up 1:1 with what the frontend's `api.get()` /
  // `api.post()` take (which are already relative to `/api`).

  const config = new DocumentBuilder()
    .setTitle('College Social API')
    .setDescription(
      'Auto-generated from the NestJS controllers + class-validator DTOs. Paths are relative to the `/api` mount.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const doc = SwaggerModule.createDocument(app, config);
  const out = join(process.cwd(), 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));

  const pathCount = Object.keys(doc.paths ?? {}).length;
  // eslint-disable-next-line no-console
  console.log(`Wrote ${out} (${pathCount} paths).`);

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('gen-openapi failed:', err);
  process.exit(1);
});
