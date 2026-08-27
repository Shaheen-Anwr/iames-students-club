import {
  BadRequestException,
  Controller,
  Delete,
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
import { StorageService } from './storage.service';

// All endpoints require a valid JWT and expect multipart/form-data with a single field named "file".
// Files are streamed to a temp file on disk (see multer.config.ts) and uploaded to cloud storage
// here, where DI works normally. The response always includes `url`, the storage URL to hand back
// to the frontend / store on a Post -- and `chunkCount` when the file was too large for a single
// Cloudinary asset and got transparently split (see StorageService.upload()); omitted/1 otherwise.
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  // POST /api/upload/photo -> uploads + immediately sets the caller's profile photo
  @Post('photo')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('photos')))
  async uploadPhoto(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const { url } = await this.storageService.upload(file, 'photos');
    await this.usersService.updatePhoto(user.userId, url);
    return { url, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/cover-photo -> uploads + immediately sets the caller's profile cover photo
  @Post('cover-photo')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('cover-photos')))
  async uploadCoverPhoto(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const { url } = await this.storageService.upload(file, 'cover-photos');
    await this.usersService.updateCoverPhoto(user.userId, url);
    return { url, size: file.size, mimeType: file.mimetype };
  }

  // DELETE /api/upload/photo -> clears the caller's profile photo
  @Delete('photo')
  async removePhoto(@CurrentUser() user: AuthenticatedUser) {
    await this.usersService.removePhoto(user.userId);
    return { success: true };
  }

  // DELETE /api/upload/cover-photo -> clears the caller's profile cover photo
  @Delete('cover-photo')
  async removeCoverPhoto(@CurrentUser() user: AuthenticatedUser) {
    await this.usersService.removeCoverPhoto(user.userId);
    return { success: true };
  }

  // POST /api/upload/post-images -> up to 10 photos for an image feed post (field name "files")
  @Post('post-images')
  @UseInterceptors(FilesInterceptor('files', 10, buildMulterOptions('post-images')))
  async uploadPostImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('لم يتم رفع أي صور');
    const uploaded = await Promise.all(
      files.map(async (file) => ({
        ...(await this.storageService.upload(file, 'post-images')),
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
    const { url, chunkCount } = await this.storageService.upload(file, 'lectures');
    return { url, chunkCount, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/video -> lecture recordings / clips
  @Post('video')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('videos')))
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const { url, chunkCount } = await this.storageService.upload(file, 'videos');
    return { url, chunkCount, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/file -> anything else (zip, code, etc.)
  @Post('file')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('files')))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const { url, chunkCount } = await this.storageService.upload(file, 'files');
    return { url, chunkCount, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/audio -> chat voice notes + shared audio clips
  @Post('audio')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('audio')))
  async uploadAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const { url } = await this.storageService.upload(file, 'audio');
    return { url, originalName: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  // POST /api/upload/chat-background -> a custom wallpaper image for a chat conversation
  @Post('chat-background')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('chat-backgrounds')))
  async uploadChatBackground(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const { url } = await this.storageService.upload(file, 'chat-backgrounds');
    return { url, size: file.size, mimeType: file.mimetype };
  }
}
