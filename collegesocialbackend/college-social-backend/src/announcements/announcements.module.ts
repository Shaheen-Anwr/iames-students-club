import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Announcement, AnnouncementSchema } from './schemas/announcement.schema';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Announcement.name, schema: AnnouncementSchema }])],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
