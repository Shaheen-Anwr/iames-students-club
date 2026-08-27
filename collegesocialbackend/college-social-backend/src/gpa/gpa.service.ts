import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GpaCourse, GpaCourseDocument } from './schemas/gpa-course.schema';
import { CreateGpaCourseDto } from './dto/create-gpa-course.dto';
import { UpdateGpaCourseDto } from './dto/update-gpa-course.dto';
import { GRADE_POINTS } from './grade-points';

export interface TermSummary {
  term: string;
  gpa: number;
  credits: number;
}

export interface GpaSummary {
  cumulative: { gpa: number; credits: number; points: number };
  terms: TermSummary[];
  gradedCredits: number;
  totalCredits: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// GPA over a set of courses: sum(points * credits) / sum(credits), counting only graded courses
// that count toward the GPA. Returns 0 credits/gpa when nothing qualifies.
function gpaOf(courses: GpaCourseDocument[]): { gpa: number; credits: number; points: number } {
  let credits = 0;
  let points = 0;
  for (const c of courses) {
    // countsTowardGpa is opt-out (schema default true) -- only an explicit false drops a course.
    if (!c.grade || c.countsTowardGpa === false) continue;
    credits += c.creditHours;
    points += GRADE_POINTS[c.grade] * c.creditHours;
  }
  return { gpa: credits ? round2(points / credits) : 0, credits: round2(credits), points: round2(points) };
}

@Injectable()
export class GpaService {
  constructor(@InjectModel(GpaCourse.name) private gpaModel: Model<GpaCourseDocument>) {}

  async create(ownerId: string, dto: CreateGpaCourseDto): Promise<GpaCourseDocument> {
    const course = new this.gpaModel({
      owner: new Types.ObjectId(ownerId),
      name: dto.name,
      creditHours: dto.creditHours,
      grade: dto.grade ?? null,
      term: dto.term,
      countsTowardGpa: dto.countsTowardGpa ?? true,
    });
    return course.save();
  }

  // Bounded personal dataset -- no pagination, same as PlannerService.findAllForOwner.
  async findAllForOwner(ownerId: string): Promise<GpaCourseDocument[]> {
    return this.gpaModel
      .find({ owner: new Types.ObjectId(ownerId) })
      .sort({ term: 1, createdAt: 1 })
      .exec();
  }

  private async findOwned(id: string, ownerId: string): Promise<GpaCourseDocument> {
    const course = await this.gpaModel.findOne({ _id: id, owner: new Types.ObjectId(ownerId) }).exec();
    if (!course) throw new NotFoundException('المقرر غير موجود');
    return course;
  }

  async update(id: string, ownerId: string, dto: UpdateGpaCourseDto): Promise<GpaCourseDocument> {
    const course = await this.findOwned(id, ownerId);
    if (dto.name !== undefined) course.name = dto.name;
    if (dto.creditHours !== undefined) course.creditHours = dto.creditHours;
    if (dto.grade !== undefined) course.grade = dto.grade;
    if (dto.term !== undefined) course.term = dto.term;
    if (dto.countsTowardGpa !== undefined) course.countsTowardGpa = dto.countsTowardGpa;
    return course.save();
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const course = await this.findOwned(id, ownerId);
    await this.gpaModel.findByIdAndDelete(course._id).exec();
  }

  async getSummaryForOwner(ownerId: string): Promise<GpaSummary> {
    const courses = await this.findAllForOwner(ownerId);

    const byTerm = new Map<string, GpaCourseDocument[]>();
    for (const c of courses) {
      const list = byTerm.get(c.term) ?? [];
      list.push(c);
      byTerm.set(c.term, list);
    }

    const terms: TermSummary[] = [...byTerm.entries()].map(([term, list]) => {
      const { gpa, credits } = gpaOf(list);
      return { term, gpa, credits };
    });

    const cumulative = gpaOf(courses);
    const totalCredits = round2(courses.reduce((sum, c) => sum + c.creditHours, 0));

    return { cumulative, terms, gradedCredits: cumulative.credits, totalCredits };
  }
}
