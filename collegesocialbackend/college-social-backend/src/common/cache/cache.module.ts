import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

// Global so any feature module can inject CacheService without importing this module. ConfigModule
// is already global (see app.module.ts), so CacheService's ConfigService dependency resolves here.
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
