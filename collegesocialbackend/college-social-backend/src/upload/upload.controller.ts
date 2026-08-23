import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UsersService } from '../users/users.service';
import { buildMulterOptions } from './multer.config';
import { S3Service } from './s3.service';

// All endpoints require a valid JWT and expect multipart/form-data with a single field named "file".
// Files are buffered in memory (see multer.config.ts) and uploaded to S3 here, where DI works
// normally. The response always includes `url`, the S3 URL to hand back to the frontend / store on a Post.
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(
    private readonly usersService: UsersService,
    private readonly s3Service: S3Service,
  ) {}

  // POST /api/upload/photo -> uploads + immediately sets the caller's profile photo
  @Post('photo')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('photos')))
  async uploadPhoto(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const url = await this.s3Service.upload(file.buffer, 'photos', file.mimetype, file.originalname);
    await this.usersService.updatePhoto(user.userId, url);
    return { url, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/cover-photo -> uploads + immediately sets the caller's profile cover photo
  @Post('cover-photo')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('cover-photos')))
  async uploadCoverPhoto(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const url = await this.s3Service.upload(file.buffer, 'cover-photos', file.mimetype, file.originalname);
    await this.usersService.updateCoverPhoto(user.userId, url);
    return { url, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/post-images -> up to 10 photos for an image feed post (field name "files")
  @Post('post-images')
  @UseInterceptors(FilesInterceptor('files', 10, buildMulterOptions('post-images')))
  async uploadPostImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('لم يتم رفع أي صور');
    const uploaded = await Promise.all(
      files.map(async (file) => ({
        url: await this.s3Service.upload(file.buffer, 'post-images', file.mimetype, file.originalname),
        size: file.size,
        mimeType: file.mimetype,
      })),
    );
    return { images: uploaded.map((u) => u.url) };
  }

  // POST /api/upload/lecture -> pdf/ppt/doc slide decks and notes
  @Post('lecture')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('lectures')))
  async uploadLecture(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const url = await this.s3Service.upload(file.buffer, 'lectures', file.mimetype, file.originalname);
    return { url, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/video -> lecture recordings / clips
  @Post('video')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('videos')))
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const url = await this.s3Service.upload(file.buffer, 'videos', file.mimetype, file.originalname);
    return { url, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/file -> anything else (zip, code, etc.)
  @Post('file')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('files')))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const url = await this.s3Service.upload(file.buffer, 'files', file.mimetype, file.originalname);
    return { url, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/audio -> chat voice notes + shared audio clips
  @Post('audio')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('audio')))
  async uploadAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const url = await this.s3Service.upload(file.buffer, 'audio', file.mimetype, file.originalname);
    return { url, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/chat-background -> a custom wallpaper image for a chat conversation
  @Post('chat-background')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('chat-backgrounds')))
  async uploadChatBackground(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const url = await this.s3Service.upload(file.buffer, 'chat-backgrounds', file.mimetype, file.originalname);
    return { url, size: file.size, mimeType: file.mimetype };
  }
}
