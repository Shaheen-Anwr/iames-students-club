import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Quiz, QuizSchema } from './schemas/quiz.schema';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Quiz.name, schema: QuizSchema }]), GamificationModule],
  controllers: [QuizzesController],
  providers: [QuizzesService],
  exports: [QuizzesService],
})
export class QuizzesModule {}
