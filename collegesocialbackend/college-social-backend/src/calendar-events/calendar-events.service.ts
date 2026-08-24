import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { CalendarEvent, CalendarEventDocument } from './schemas/calendar-event.schema';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { PushService } from '../push/push.service';

@Injectable()
export class CalendarEventsService {
  private readonly logger = new Logger(CalendarEventsService.name);

  constructor(
    @InjectModel(CalendarEvent.name) private calendarEventModel: Model<CalendarEventDocument>,
    private readonly pushService: PushService,
    private readonly config: ConfigService,
  ) {}

  async create(ownerId: string, dto: CreateCalendarEventDto): Promise<CalendarEventDocument> {
    if (dto.kind === 'reminder' && !dto.time) {
      throw new BadRequestException('التذكير يحتاج إلى وقت لتفعيله');
    }
    const event = new this.calendarEventModel({
      owner: new Types.ObjectId(ownerId),
      title: dto.title,
      notes: dto.notes ?? null,
      date: new Date(dto.date),
      time: dto.time ?? null,
      kind: dto.kind,
    });
    return event.save();
  }

  // Used by CalendarService to pull the month's events/reminders.
  async findInRange(ownerId: string, start: Date, end: Date): Promise<CalendarEventDocument[]> {
    return this.calendarEventModel
      .find({ owner: new Types.ObjectId(ownerId), date: { $gte: start, $lt: end } })
      .sort({ date: 1, time: 1 })
      .exec();
  }

  private async findOwned(id: string, ownerId: string): Promise<CalendarEventDocument> {
    const event = await this.calendarEventModel.findOne({ _id: id, owner: new Types.ObjectId(ownerId) }).exec();
    if (!event) throw new NotFoundException('العنصر غير موجود');
    return event;
  }

  async update(id: string, ownerId: string, dto: UpdateCalendarEventDto): Promise<CalendarEventDocument> {
    const event = await this.findOwned(id, ownerId);
    if (dto.title !== undefined) event.title = dto.title;
    if (dto.notes !== undefined) event.notes = dto.notes;
    if (dto.date !== undefined) event.date = new Date(dto.date);
    if (dto.time !== undefined) event.time = dto.time;
    if (dto.kind !== undefined) event.kind = dto.kind;
    if (event.kind === 'reminder' && !event.time) {
      throw new BadRequestException('التذكير يحتاج إلى وقت لتفعيله');
    }
    // A meaningful edit to a reminder that hasn't fired yet should still fire at the (possibly
    // new) time -- but if it already fired, leave `notified` alone rather than re-sending it.
    return event.save();
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const event = await this.findOwned(id, ownerId);
    await this.calendarEventModel.findByIdAndDelete(event._id).exec();
  }

  // Every minute: cheap, index-backed prefilter (today-or-earlier, not yet sent), then an
  // in-memory check of each candidate's exact date+time against now -- combining a Date field and
  // a separate "HH:mm" string field isn't expressible as a single Mongo query. Candidate volume
  // per tick is tiny (personal reminders across the whole platform), so this is fine.
  @Cron('*/1 * * * *')
  async checkReminders(): Promise<void> {
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);

    const candidates = await this.calendarEventModel
      .find({ kind: 'reminder', notified: false, date: { $lte: endOfToday } })
      .exec();
    if (!candidates.length) return;

    const now = new Date();
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';

    for (const reminder of candidates) {
      if (!reminder.time) continue; // shouldn't happen (enforced on create/update), guard anyway
      const [hours, minutes] = reminder.time.split(':').map(Number);
      const fireAt = new Date(reminder.date);
      fireAt.setUTCHours(hours, minutes, 0, 0);
      if (fireAt > now) continue;

      try {
        await this.pushService.sendToUser(reminder.owner.toString(), {
          title: `⏰ تذكير: ${reminder.title}`,
          body: reminder.notes ?? `في الساعة ${reminder.time}`,
          url: `${frontendUrl}/study/calendar`,
          icon: `${frontendUrl}/icons/icon-192.png`,
          tag: 'calendar-reminder',
        });
      } catch (err) {
        this.logger.warn(`Failed to send reminder push for ${reminder.id}: ${err instanceof Error ? err.message : err}`);
      }
      reminder.notified = true;
      await reminder.save();
    }
  }
}
