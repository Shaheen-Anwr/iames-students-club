import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LectureNote, LectureNoteSchema } from './lecture-note.schema';
import { LectureNotesController } from './lecture-notes.controller';
import { LectureNotesService } from './lecture-notes.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: LectureNote.name, schema: LectureNoteSchema }])],
  controllers: [LectureNotesController],
  providers: [LectureNotesService],
})
export class LectureNotesModule {}
