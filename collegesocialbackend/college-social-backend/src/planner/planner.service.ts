import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlannerTask, PlannerTaskDocument } from './schemas/planner-task.schema';
import { CreatePlannerTaskDto } from './dto/create-planner-task.dto';
import { UpdatePlannerTaskDto } from './dto/update-planner-task.dto';

export interface PlannerStats {
  totalTasks: number;
  doneTasks: number;
  usersWithTasks: number;
  avgTasksPerUser: number;
}

@Injectable()
export class PlannerService {
  constructor(@InjectModel(PlannerTask.name) private plannerModel: Model<PlannerTaskDocument>) {}

  async create(ownerId: string, dto: CreatePlannerTaskDto): Promise<PlannerTaskDocument> {
    const task = new this.plannerModel({
      owner: new Types.ObjectId(ownerId),
      title: dto.title,
      notes: dto.notes ?? null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      courseCode: dto.courseCode ?? null,
    });
    return task.save();
  }

  // Bounded personal dataset (a student's own to-do list) -- no pagination needed, same as
  // ScheduleService.findAllForOwner. Not-done first, then soonest due date, undated last.
  async findAllForOwner(ownerId: string): Promise<PlannerTaskDocument[]> {
    return this.plannerModel
      .find({ owner: new Types.ObjectId(ownerId) })
      .sort({ done: 1, dueDate: 1, createdAt: -1 })
      .exec();
  }

  // Used by CalendarService to pull the month's dated tasks.
  async findDueInRange(ownerId: string, start: Date, end: Date): Promise<PlannerTaskDocument[]> {
    return this.plannerModel
      .find({ owner: new Types.ObjectId(ownerId), dueDate: { $gte: start, $lt: end } })
      .sort({ dueDate: 1 })
      .exec();
  }

  private async findOwned(id: string, ownerId: string): Promise<PlannerTaskDocument> {
    const task = await this.plannerModel.findOne({ _id: id, owner: new Types.ObjectId(ownerId) }).exec();
    if (!task) throw new NotFoundException('المهمة غير موجودة');
    return task;
  }

  async update(id: string, ownerId: string, dto: UpdatePlannerTaskDto): Promise<PlannerTaskDocument> {
    const task = await this.findOwned(id, ownerId);
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.notes !== undefined) task.notes = dto.notes;
    if (dto.dueDate !== undefined) task.dueDate = new Date(dto.dueDate);
    if (dto.courseCode !== undefined) task.courseCode = dto.courseCode;
    return task.save();
  }

  async toggleDone(id: string, ownerId: string): Promise<PlannerTaskDocument> {
    const task = await this.findOwned(id, ownerId);
    task.done = !task.done;
    return task.save();
  }

  // Idempotent, unlike toggleDone -- used by the AI assistant's complete_planner_task tool, where
  // a model blindly calling a toggle could un-complete a task the student already finished.
  async setDone(id: string, ownerId: string, done: boolean): Promise<PlannerTaskDocument> {
    const task = await this.findOwned(id, ownerId);
    task.done = done;
    return task.save();
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const task = await this.findOwned(id, ownerId);
    await this.plannerModel.findByIdAndDelete(task._id).exec();
  }

  // --- Admin-only operations (guarded at the controller level) ---
  // Aggregate usage only -- personal to-do lists aren't something an admin edits per-user.

  async getStats(): Promise<PlannerStats> {
    const [totalTasks, doneTasks, distinctOwners] = await Promise.all([
      this.plannerModel.countDocuments().exec(),
      this.plannerModel.countDocuments({ done: true }).exec(),
      this.plannerModel.distinct('owner').exec(),
    ]);
    const usersWithTasks = distinctOwners.length;
    return {
      totalTasks,
      doneTasks,
      usersWithTasks,
      avgTasksPerUser: usersWithTasks ? Math.round((totalTasks / usersWithTasks) * 10) / 10 : 0,
    };
  }
}
