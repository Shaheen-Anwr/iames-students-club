import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversion, ConversionSchema } from './schemas/conversion.schema';
import { StagedUpload, StagedUploadSchema } from './schemas/staged-upload.schema';
import { ConvertController } from './convert.controller';
import { ConvertToolsController } from './convert-tools.controller';
import { ConvertService } from './convert.service';
import { ConvertQueueService } from './convert-queue.service';
import { ConvertCleanupService } from './convert-cleanup.service';

// محوّل الملفات -- PDF / Word / PowerPoint / Excel conversion, plus PDF tools (merge/split/reorder/
// rotate/pages/watermark/compress/protect/OCR, see ConvertToolsController). Uploads are queued and
// worked in the background by ConvertQueueService (Adobe PDF Services when configured, else Poppler
// / LibreOffice / pure-JS / pdf-lib). See src/convert/formats.ts for the matrix and
// src/convert/engines/* for the engines.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversion.name, schema: ConversionSchema },
      { name: StagedUpload.name, schema: StagedUploadSchema },
    ]),
  ],
  controllers: [ConvertController, ConvertToolsController],
  providers: [ConvertService, ConvertQueueService, ConvertCleanupService],
})
export class ConvertModule {}
