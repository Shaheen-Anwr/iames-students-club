import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { UploadController } from './upload.controller';
import { S3Service } from './s3.service';

@Module({
  imports: [UsersModule],
  controllers: [UploadController],
  providers: [S3Service],
  exports: [S3Service],
})
export class UploadModule {}
