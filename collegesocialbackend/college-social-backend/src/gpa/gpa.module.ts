import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GpaCourse, GpaCourseSchema } from './schemas/gpa-course.schema';
import { GpaService } from './gpa.service';
import { GpaController } from './gpa.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: GpaCourse.name, schema: GpaCourseSchema }])],
  controllers: [GpaController],
  providers: [GpaService],
  exports: [GpaService],
})
export class GpaModule {}
