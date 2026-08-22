import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Question, QuestionDocument, QuestionScope } from './schemas/question.schema';
import { Answer, AnswerDocument } from './schemas/answer.schema';
import { AskQuestionDto } from './dto/ask-question.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Department } from '../common/enums/department.enum';

export interface PaginatedQuestions {
  data: QuestionDocument[];
  total: number;
  page: number;
  limit: number;
}

export interface QaStats {
  totalQuestions: number;
  totalAnswers: number;
  acceptedAnswers: number;
  unanswered: number;
}

@Injectable()
export class QaService {
  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    @InjectModel(Answer.name) private answerModel: Model<AnswerDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async askQuestion(authorId: string, authorDepartment: Department | null, dto: AskQuestionDto): Promise<QuestionDocument> {
    const scope = authorDepartment ? (dto.scope ?? QuestionScope.DEPARTMENT) : QuestionScope.PUBLIC;
    const question = new this.questionModel({
      author: new Types.ObjectId(authorId),
      title: dto.title,
      body: dto.body,
      courseCode: dto.courseCode ?? null,
      scope,
      department: scope === QuestionScope.DEPARTMENT ? authorDepartment : null,
    });
    return question.save();
  }

  // Same public/department split as PostsService.feed() -- viewerDepartment comes from the JWT.
  async listQuestions(
    page = 1,
    limit = 20,
    courseCode?: string,
    scope?: QuestionScope,
    viewerDepartment?: Department | null,
  ): Promise<QuestionDocument[]> {
    const filter: Record<string, unknown> = {};
    if (courseCode) filter.courseCode = courseCode;
    if (scope === QuestionScope.DEPARTMENT) {
      filter.scope = QuestionScope.DEPARTMENT;
      filter.department = viewerDepartment ?? null;
    } else if (scope === QuestionScope.PUBLIC) {
      filter.scope = QuestionScope.PUBLIC;
    }
    return this.questionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .exec();
  }

  // Used by SearchService -- $text search over title/body, scoped the same way listQuestions() is.
  async search(query: string, limit: number, viewerDepartment?: Department | null): Promise<QuestionDocument[]> {
    return this.questionModel
      .find({
        $text: { $search: query },
        $or: [{ scope: QuestionScope.PUBLIC }, { scope: QuestionScope.DEPARTMENT, department: viewerDepartment ?? null }],
      })
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .exec();
  }

  async findOne(id: string): Promise<QuestionDocument> {
    const question = await this.questionModel.findById(id).populate('author', 'name role photoUrl collegeId').exec();
    if (!question) throw new NotFoundException('السؤال غير موجود');
    return question;
  }

  async answer(questionId: string, authorId: string, body: string): Promise<AnswerDocument> {
    const question = await this.findOne(questionId);
    const answer = await new this.answerModel({
      question: question._id,
      author: new Types.ObjectId(authorId),
      body,
    }).save();
    await this.questionModel.findByIdAndUpdate(questionId, { $inc: { answerCount: 1 } }).exec();

    if (question.author && question.author._id.toString() !== authorId) {
      await this.notificationsService.create({
        recipient: question.author._id,
        actor: authorId,
        type: 'qa_answer',
        questionId,
        preview: body.slice(0, 120),
      });
    }
    return answer.populate('author', 'name role photoUrl');
  }

  // Accepted answer first, then most-upvoted, then oldest -- a reasonable default ordering for a
  // Q&A thread without introducing a separate "best answer" ranking algorithm.
  async listAnswers(questionId: string): Promise<AnswerDocument[]> {
    const answers = await this.answerModel
      .find({ question: new Types.ObjectId(questionId) })
      .sort({ createdAt: 1 })
      .populate('author', 'name role photoUrl')
      .exec();
    return answers.sort((a, b) => {
      if (a.isAccepted !== b.isAccepted) return a.isAccepted ? -1 : 1;
      return b.upvotes.length - a.upvotes.length;
    });
  }

  async toggleUpvote(answerId: string, userId: string): Promise<AnswerDocument> {
    const answer = await this.answerModel.findById(answerId).exec();
    if (!answer) throw new NotFoundException('الإجابة غير موجودة');
    const uid = new Types.ObjectId(userId);
    const alreadyUpvoted = answer.upvotes.some((u) => u.equals(uid));
    if (alreadyUpvoted) {
      answer.upvotes = answer.upvotes.filter((u) => !u.equals(uid));
    } else {
      answer.upvotes.push(uid);
    }
    return answer.save();
  }

  async acceptAnswer(answerId: string, requesterId: string): Promise<AnswerDocument> {
    const answer = await this.answerModel.findById(answerId).exec();
    if (!answer) throw new NotFoundException('الإجابة غير موجودة');
    const question = await this.findOne(answer.question.toString());
    if (!question.author || question.author._id.toString() !== requesterId) {
      throw new ForbiddenException('يمكن لصاحب السؤال فقط قبول إجابة');
    }
    await this.answerModel.updateMany({ question: question._id }, { isAccepted: false }).exec();
    answer.isAccepted = true;
    return answer.save();
  }

  // --- Admin-only operations (guarded at the controller level) ---
  // There was previously no delete path at all for questions/answers -- this module had zero
  // moderation capability, so these are new, not admin-bypasses of an existing remove().

  async adminListQuestions(page = 1, limit = 20, search?: string): Promise<PaginatedQuestions> {
    const filter = search
      ? { $or: [{ title: { $regex: search, $options: 'i' } }, { courseCode: { $regex: search, $options: 'i' } }] }
      : {};
    const [data, total] = await Promise.all([
      this.questionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name role photoUrl collegeId')
        .exec(),
      this.questionModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  async adminRemoveQuestion(id: string): Promise<void> {
    const question = await this.questionModel.findByIdAndDelete(id).exec();
    if (!question) throw new NotFoundException('السؤال غير موجود');
    await this.answerModel.deleteMany({ question: question._id }).exec();
  }

  async adminRemoveAnswer(id: string): Promise<void> {
    const answer = await this.answerModel.findByIdAndDelete(id).exec();
    if (!answer) throw new NotFoundException('الإجابة غير موجودة');
    await this.questionModel.findByIdAndUpdate(answer.question, { $inc: { answerCount: -1 } }).exec();
  }

  async getStats(): Promise<QaStats> {
    const [totalQuestions, totalAnswers, acceptedAnswers, unanswered] = await Promise.all([
      this.questionModel.countDocuments().exec(),
      this.answerModel.countDocuments().exec(),
      this.answerModel.countDocuments({ isAccepted: true }).exec(),
      this.questionModel.countDocuments({ answerCount: 0 }).exec(),
    ]);
    return { totalQuestions, totalAnswers, acceptedAnswers, unanswered };
  }
}
