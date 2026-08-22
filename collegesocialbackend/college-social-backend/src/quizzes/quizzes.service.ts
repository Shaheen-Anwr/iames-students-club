import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Quiz, QuizAttempt, QuizDocument } from './schemas/quiz.schema';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { SubmitQuizAttemptDto } from './dto/submit-quiz-attempt.dto';
import { GamificationService } from '../gamification/gamification.service';
import { POINTS } from '../gamification/badges';
import { DailyCount, daysAgoStart, fillDailyCounts } from '../common/utils/daily-counts.util';

export interface QuizStats {
  totalQuizzes: number;
  totalAttempts: number;
  avgScorePercent: number;
  dailyAttempts: DailyCount[];
}

@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(Quiz.name) private quizModel: Model<QuizDocument>,
    private readonly gamificationService: GamificationService,
  ) {}

  async create(creatorId: string, dto: CreateQuizDto): Promise<QuizDocument> {
    dto.questions.forEach((q, i) => {
      if (q.correctIndex >= q.options.length) {
        throw new BadRequestException(`الإجابة الصحيحة للسؤال ${i + 1} غير صالحة`);
      }
    });

    const quiz = new this.quizModel({
      createdBy: new Types.ObjectId(creatorId),
      title: dto.title,
      description: dto.description ?? '',
      courseCode: dto.courseCode ?? null,
      questions: dto.questions,
    });
    await quiz.save();
    return quiz.populate('createdBy', 'name role photoUrl');
  }

  // GET /api/quizzes -- global feed, not owner/department-scoped, matching AssignmentsService.findAll.
  async findAll(page = 1, limit = 20, courseCode: string | undefined, viewerId: string) {
    const filter: Record<string, unknown> = {};
    if (courseCode) filter.courseCode = courseCode;
    const quizzes = await this.quizModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name role photoUrl')
      .exec();
    return quizzes.map((quiz) => this.toSummary(quiz, viewerId));
  }

  async findOne(id: string, viewerId: string) {
    const quiz = await this.findRaw(id);
    return this.toDetail(quiz, viewerId);
  }

  async submitAttempt(id: string, userId: string, dto: SubmitQuizAttemptDto) {
    const quiz = await this.quizModel.findById(id).exec();
    if (!quiz) throw new NotFoundException('الاختبار غير موجود');

    const uid = new Types.ObjectId(userId);
    if (quiz.attempts.some((a) => a.user.equals(uid))) {
      throw new ForbiddenException('لقد قمت بحل هذا الاختبار من قبل');
    }
    if (dto.answers.length !== quiz.questions.length) {
      throw new BadRequestException('عدد الإجابات لا يطابق عدد الأسئلة');
    }

    const score = quiz.questions.reduce((total, q, i) => total + (dto.answers[i] === q.correctIndex ? 1 : 0), 0);
    quiz.attempts.push({ user: uid, answers: dto.answers, score, submittedAt: new Date() } as QuizAttempt);
    await quiz.save();

    await this.gamificationService.awardPoints(userId, POINTS.QUIZ_ATTEMPTED);
    const attemptCount = await this.quizModel.countDocuments({ attempts: { $elemMatch: { user: uid } } }).exec();
    if (attemptCount >= 5) await this.gamificationService.maybeAwardBadge(userId, 'quizzes_5');

    return {
      score,
      total: quiz.questions.length,
      correctIndexes: quiz.questions.map((q) => q.correctIndex),
    };
  }

  async remove(id: string, requesterId: string): Promise<void> {
    const quiz = await this.findRaw(id);
    if (!quiz.createdBy || quiz.createdBy._id.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك حذف الاختبارات التي أنشأتها فقط');
    }
    await this.quizModel.findByIdAndDelete(id).exec();
  }

  // --- Admin-only operations (guarded at the controller level) ---

  async adminListQuizzes(page = 1, limit = 20, search?: string) {
    const filter = search
      ? { $or: [{ title: { $regex: search, $options: 'i' } }, { courseCode: { $regex: search, $options: 'i' } }] }
      : {};
    const [quizzes, total] = await Promise.all([
      this.quizModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('createdBy', 'name role photoUrl')
        .exec(),
      this.quizModel.countDocuments(filter).exec(),
    ]);
    const data = quizzes.map((quiz) => ({
      _id: quiz.id,
      createdBy: quiz.createdBy,
      title: quiz.title,
      courseCode: quiz.courseCode,
      questionCount: quiz.questions.length,
      attemptCount: quiz.attempts.length,
      createdAt: (quiz as unknown as { createdAt: Date }).createdAt,
    }));
    return { data, total, page, limit };
  }

  // Same as remove() but skips the creator-ownership check -- an admin can delete any quiz.
  async adminRemove(id: string): Promise<void> {
    const quiz = await this.quizModel.findByIdAndDelete(id).exec();
    if (!quiz) throw new NotFoundException('الاختبار غير موجود');
  }

  async getStats(): Promise<QuizStats> {
    const [totalQuizzes, scoreAgg, dailyAttempts] = await Promise.all([
      this.quizModel.countDocuments().exec(),
      this.quizModel
        .aggregate<{ totalAttempts: number; avgPercent: number }>([
          { $unwind: '$attempts' },
          {
            $project: {
              score: '$attempts.score',
              total: { $size: '$questions' },
            },
          },
          {
            $group: {
              _id: null,
              totalAttempts: { $sum: 1 },
              avgPercent: { $avg: { $cond: [{ $eq: ['$total', 0] }, 0, { $divide: ['$score', '$total'] }] } },
            },
          },
        ])
        .exec(),
      this.dailyAttempts(14),
    ]);
    return {
      totalQuizzes,
      totalAttempts: scoreAgg[0]?.totalAttempts ?? 0,
      avgScorePercent: Math.round((scoreAgg[0]?.avgPercent ?? 0) * 1000) / 10,
      dailyAttempts,
    };
  }

  private async dailyAttempts(days: number): Promise<DailyCount[]> {
    const rows = await this.quizModel
      .aggregate<{ _id: string; count: number }>([
        { $unwind: '$attempts' },
        { $match: { 'attempts.submittedAt': { $gte: daysAgoStart(days) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$attempts.submittedAt' } },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();
    return fillDailyCounts(rows, days);
  }

  private async findRaw(id: string): Promise<QuizDocument> {
    const quiz = await this.quizModel.findById(id).populate('createdBy', 'name role photoUrl').exec();
    if (!quiz) throw new NotFoundException('الاختبار غير موجود');
    return quiz;
  }

  private toSummary(quiz: QuizDocument, viewerId: string) {
    const myAttempt = quiz.attempts.find((a) => a.user.toString() === viewerId);
    return {
      _id: quiz.id,
      createdBy: quiz.createdBy,
      title: quiz.title,
      description: quiz.description,
      courseCode: quiz.courseCode,
      questionCount: quiz.questions.length,
      attemptCount: quiz.attempts.length,
      myScore: myAttempt ? myAttempt.score : null,
      createdAt: (quiz as unknown as { createdAt: Date }).createdAt,
    };
  }

  // Correct answers are only revealed once the viewer has taken the quiz (or is its creator) --
  // withholding them beforehand is the whole point of the "attempt" flow.
  private toDetail(quiz: QuizDocument, viewerId: string) {
    const isCreator = !!quiz.createdBy && quiz.createdBy._id.toString() === viewerId;
    const myAttempt = quiz.attempts.find((a) => a.user.toString() === viewerId);
    const revealAnswers = isCreator || !!myAttempt;

    return {
      _id: quiz.id,
      createdBy: quiz.createdBy,
      title: quiz.title,
      description: quiz.description,
      courseCode: quiz.courseCode,
      attemptCount: quiz.attempts.length,
      createdAt: (quiz as unknown as { createdAt: Date }).createdAt,
      myAttempt: myAttempt ? { score: myAttempt.score, answers: myAttempt.answers } : null,
      questions: quiz.questions.map((q) => ({
        text: q.text,
        options: q.options,
        correctIndex: revealAnswers ? q.correctIndex : undefined,
      })),
    };
  }
}
