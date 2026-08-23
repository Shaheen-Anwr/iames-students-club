import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { UploadController } from './upload.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [UsersModule],
  controllers: [UploadController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadModule {}
