import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversion, ConversionSchema } from './schemas/conversion.schema';
import { ConvertController } from './convert.controller';
import { ConvertService } from './convert.service';
import { ConvertQueueService } from './convert-queue.service';
import { ConvertCleanupService } from './convert-cleanup.service';

// محوّل الملفات -- PDF / Word / PowerPoint / Excel conversion. Uploads are queued and worked in the
// background by ConvertQueueService (Adobe PDF Services when configured, else Poppler / LibreOffice
// / pure-JS). See src/convert/formats.ts for the matrix and src/convert/engines/* for the engines.
@Module({
  imports: [MongooseModule.forFeature([{ name: Conversion.name, schema: ConversionSchema }])],
  controllers: [ConvertController],
  providers: [ConvertService, ConvertQueueService, ConvertCleanupService],
})
export class ConvertModule {}
