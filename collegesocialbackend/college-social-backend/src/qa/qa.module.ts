import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Question, QuestionSchema } from './schemas/question.schema';
import { Answer, AnswerSchema } from './schemas/answer.schema';
import { QaService } from './qa.service';
import { QaController } from './qa.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: Answer.name, schema: AnswerSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [QaController],
  providers: [QaService],
  exports: [QaService],
})
export class QaModule {}
