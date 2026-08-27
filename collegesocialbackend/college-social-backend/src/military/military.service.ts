import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PDFParse } from 'pdf-parse';
import { MilitaryPeriod, MilitaryPeriodDocument } from './schemas/military-period.schema';
import { MilitaryCheckIn, MilitaryCheckInDocument } from './schemas/military-checkin.schema';
import { MilitaryScheduleItem, MilitaryScheduleItemDocument } from './schemas/military-schedule-item.schema';
import { MilitaryTodo, MilitaryTodoDocument } from './schemas/military-todo.schema';
import { MilitaryStudentSettings, MilitaryStudentSettingsDocument } from './schemas/military-student-settings.schema';
import { MilitaryRosterMember, MilitaryRosterMemberDocument } from './schemas/military-roster-member.schema';
import { Assignment, AssignmentDocument } from '../assignments/schemas/assignment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { GamificationService } from '../gamification/gamification.service';
import { POINTS } from '../gamification/badges';
import { UpsertMilitaryPeriodDto } from './dto/upsert-military-period.dto';
import { UpdateMilitarySettingsDto } from './dto/update-military-settings.dto';
import { CreateMilitaryTodoDto, UpdateMilitaryTodoDto } from './dto/military-todo.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

// UTC midnight of the given date -- check-in rows are keyed by this so a repeat check-in on the
// same calendar day collides on the { user, date } unique index instead of stacking.
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfUtcDay(a).getTime() - startOfUtcDay(b).getTime()) / DAY_MS);
}

// Longest run of consecutive days ending at today (or yesterday, grace-period like
// GamificationService.recordActivity) given a set of check-in day timestamps.
function streakFrom(daySet: Set<number>, today: Date): number {
  const todayMs = startOfUtcDay(today).getTime();
  let cursor = daySet.has(todayMs) ? todayMs : todayMs - DAY_MS;
  if (!daySet.has(cursor)) return 0;
  let count = 0;
  while (daySet.has(cursor)) {
    count += 1;
    cursor -= DAY_MS;
  }
  return count;
}

// --- CSV parsing (no dependency -- handles quoted fields, escaped "" quotes and CRLF) ---

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Strip a UTF-8 BOM Excel loves to prepend.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }
  return rows;
}

// Maps a header cell (English or Arabic alias) to our canonical column name.
const HEADER_ALIASES: Record<string, 'date' | 'title' | 'start' | 'end' | 'location'> = {
  date: 'date',
  التاريخ: 'date',
  title: 'title',
  session: 'title',
  العنوان: 'title',
  البيان: 'title',
  النشاط: 'title',
  start: 'start',
  starttime: 'start',
  'start time': 'start',
  من: 'start',
  البداية: 'start',
  end: 'end',
  endtime: 'end',
  'end time': 'end',
  إلى: 'end',
  النهاية: 'end',
  location: 'location',
  place: 'location',
  المكان: 'location',
};

function normalizeTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let y: number, mo: number, d: number;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

// --- Roster (unit name list) parsing ---

// Fold an Arabic/Latin name to a comparison key: strip tatweel + diacritics, unify alef/ya/hamza
// forms, drop punctuation, collapse spaces, lowercase. The same fold is applied to User.name so a
// roster line matches an account despite the usual spelling drift.
function normalizeName(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[ـ]/g, '') // tatweel
    .replace(/[ً-ٰٟ]/g, '') // harakat / superscript alef
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي') // ئ -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation / underscores -> space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Header cells that mark the "name" column in a roster CSV.
const NAME_HEADER_ALIASES = new Set([
  'name',
  'full name',
  'fullname',
  'student',
  'student name',
  'الاسم',
  'اسم',
  'الاسم الكامل',
  'اسم الطالب',
  'الطالب',
]);

// Keep only lines that plausibly are a person's name: contains a letter, 2..80 chars, not a bare
// number / page marker.
function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (!/\p{L}/u.test(t)) return false;
  if (/^[\d\s.\-/]+$/.test(t)) return false;
  return true;
}

function namesFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  let nameCol = header.findIndex((h) => NAME_HEADER_ALIASES.has(h));
  let dataStart = 0;
  if (nameCol !== -1) {
    dataStart = 1;
  } else {
    // No recognizable header -- assume the first column is the name and every row is data.
    nameCol = 0;
  }

  const out: string[] = [];
  for (let r = dataStart; r < rows.length; r += 1) {
    const cell = (rows[r][nameCol] ?? '').trim();
    if (looksLikeName(cell)) out.push(cell);
  }
  return out;
}

async function namesFromPdf(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: buffer });
  let text: string;
  try {
    text = (await parser.getText()).text;
  } catch {
    throw new BadRequestException('تعذّرت قراءة ملف PDF. تأكد أنه غير محمي وأن النص قابل للتحديد.');
  } finally {
    await parser.destroy();
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[).\-\s]+)?/, '').trim()) // drop leading list numbering
    .filter(looksLikeName);
}

export interface MilitaryRosterUploadResult {
  total: number;
  matched: number;
  unmatched: number;
  unmatchedNames: string[];
}

export interface MilitaryStatus {
  period: MilitaryPeriodDocument | null;
  streak: number;
  checkedInToday: boolean;
  totalCheckIns: number;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  isActive: boolean;
  quote: string | null;
}

export interface MilitaryRosterEntry {
  user: Pick<User, 'name' | 'photoUrl' | 'collegeId'> & { _id: string };
  completed: number;
  total: number;
  streak: number;
  attendedDays: number;
  lastCheckIn: Date | null;
}

@Injectable()
export class MilitaryService {
  constructor(
    @InjectModel(MilitaryPeriod.name) private periodModel: Model<MilitaryPeriodDocument>,
    @InjectModel(MilitaryCheckIn.name) private checkInModel: Model<MilitaryCheckInDocument>,
    @InjectModel(MilitaryScheduleItem.name) private scheduleModel: Model<MilitaryScheduleItemDocument>,
    @InjectModel(MilitaryTodo.name) private todoModel: Model<MilitaryTodoDocument>,
    @InjectModel(MilitaryStudentSettings.name) private settingsModel: Model<MilitaryStudentSettingsDocument>,
    @InjectModel(MilitaryRosterMember.name) private rosterModel: Model<MilitaryRosterMemberDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly gamificationService: GamificationService,
  ) {}

  async getPeriod(): Promise<MilitaryPeriodDocument | null> {
    return this.periodModel.findOne().exec();
  }

  async getSchedule(): Promise<MilitaryScheduleItemDocument[]> {
    return this.scheduleModel.find().sort({ date: 1, startTime: 1 }).exec();
  }

  // Everything the /study/military section needs in one round-trip.
  async getOverview(userId: string) {
    const [status, schedule, settings, todos] = await Promise.all([
      this.getMyStatus(userId),
      this.getSchedule(),
      this.getSettings(userId),
      this.listTodos(userId),
    ]);
    return { period: status.period, myStatus: status, schedule, settings, todos };
  }

  // Admin-only (guarded at the controller). Upserts the single period document.
  async upsertPeriod(adminId: string, dto: UpsertMilitaryPeriodDto): Promise<MilitaryPeriodDocument> {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate.getTime() >= endDate.getTime()) {
      throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    }

    const update: Record<string, unknown> = {
      startDate,
      endDate,
      updatedBy: new Types.ObjectId(adminId),
    };
    if (dto.title !== undefined) update.title = dto.title.trim() || 'التربية العسكرية';
    if (dto.motivationalQuotes !== undefined) {
      update.motivationalQuotes = dto.motivationalQuotes.map((q) => q.trim()).filter(Boolean);
    }

    return this.periodModel
      .findOneAndUpdate({}, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true })
      .exec();
  }

  // Admin-only. Parses an uploaded CSV of dated sessions, replaces the whole schedule, and widens
  // the period window to span the sheet's earliest -> latest date.
  async replaceScheduleFromCsv(adminId: string, csv: string): Promise<{ inserted: number }> {
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      throw new BadRequestException('الملف فارغ أو لا يحتوي على صفوف بيانات');
    }

    const header = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()]);
    const col = (name: 'date' | 'title' | 'start' | 'end' | 'location') => header.indexOf(name);
    for (const required of ['date', 'title', 'start', 'end'] as const) {
      if (col(required) === -1) {
        throw new BadRequestException(
          `عمود مفقود في الملف: "${required}". الأعمدة المطلوبة: date, title, start, end (location اختياري).`,
        );
      }
    }

    const items: { date: Date; title: string; startTime: string; endTime: string; location: string | null }[] = [];
    for (let r = 1; r < rows.length; r += 1) {
      const line = rows[r];
      const rowNo = r + 1;
      const date = parseDate(line[col('date')] ?? '');
      const title = (line[col('title')] ?? '').trim();
      const startTime = normalizeTime(line[col('start')] ?? '');
      const endTime = normalizeTime(line[col('end')] ?? '');
      const location = col('location') !== -1 ? (line[col('location')] ?? '').trim() || null : null;

      if (!date) throw new BadRequestException(`الصف ${rowNo}: تاريخ غير صالح (استخدم YYYY-MM-DD أو DD/MM/YYYY)`);
      if (!title) throw new BadRequestException(`الصف ${rowNo}: العنوان مطلوب`);
      if (!startTime) throw new BadRequestException(`الصف ${rowNo}: وقت البداية غير صالح (HH:mm)`);
      if (!endTime) throw new BadRequestException(`الصف ${rowNo}: وقت النهاية غير صالح (HH:mm)`);
      if (startTime >= endTime) throw new BadRequestException(`الصف ${rowNo}: وقت النهاية يجب أن يكون بعد البداية`);

      items.push({ date, title, startTime, endTime, location });
    }

    await this.scheduleModel.deleteMany({}).exec();
    await this.scheduleModel.insertMany(items);

    const times = items.map((i) => i.date.getTime());
    const startDate = new Date(Math.min(...times));
    const endDate = new Date(Math.max(...times));
    await this.periodModel
      .findOneAndUpdate(
        {},
        { $set: { startDate, endDate, updatedBy: new Types.ObjectId(adminId) } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return { inserted: items.length };
  }

  // Admin-only. Parses an uploaded CSV or PDF that lists the students in the unit, replaces the
  // whole roster, and links each name to exactly one registered account where possible. Names that
  // match nobody -- or match more than one account -- are returned for the admin to fix.
  async replaceRosterFromFile(
    adminId: string,
    file: Express.Multer.File,
  ): Promise<MilitaryRosterUploadResult> {
    const isPdf =
      /\.pdf$/i.test(file.originalname) || /pdf/i.test(file.mimetype);
    const rawNames = isPdf
      ? await namesFromPdf(file.buffer)
      : namesFromCsv(file.buffer.toString('utf-8'));

    // Dedup on the normalized key, keeping the first spelling seen.
    const byKey = new Map<string, string>();
    for (const raw of rawNames) {
      const key = normalizeName(raw);
      if (key && !byKey.has(key)) byKey.set(key, raw.trim());
    }
    if (byKey.size === 0) {
      throw new BadRequestException('لم يُعثر على أي أسماء في الملف.');
    }

    // Build a normalized-name -> accounts index. A key that hits >1 account is ambiguous and left
    // unmatched on purpose.
    const students = await this.userModel.find({ role: Role.STUDENT }).select('name').exec();
    const accountsByKey = new Map<string, Types.ObjectId[]>();
    for (const s of students) {
      const key = normalizeName(s.name);
      const list = accountsByKey.get(key) ?? [];
      list.push(s._id);
      accountsByKey.set(key, list);
    }

    const docs: {
      rawName: string;
      normalizedName: string;
      matchedUser: Types.ObjectId | null;
      uploadedBy: Types.ObjectId;
    }[] = [];
    const unmatchedNames: string[] = [];
    const adminObjectId = new Types.ObjectId(adminId);
    for (const [key, rawName] of byKey) {
      const accounts = accountsByKey.get(key);
      const matchedUser = accounts && accounts.length === 1 ? accounts[0] : null;
      if (!matchedUser) unmatchedNames.push(rawName);
      docs.push({ rawName, normalizedName: key, matchedUser, uploadedBy: adminObjectId });
    }

    await this.rosterModel.deleteMany({}).exec();
    await this.rosterModel.insertMany(docs);

    const matched = docs.length - unmatchedNames.length;
    return {
      total: docs.length,
      matched,
      unmatched: unmatchedNames.length,
      unmatchedNames: unmatchedNames.sort((a, b) => a.localeCompare(b)),
    };
  }

  async getMyStatus(userId: string): Promise<MilitaryStatus> {
    const period = await this.getPeriod();
    const now = new Date();

    const checkIns = await this.checkInModel
      .find({ user: new Types.ObjectId(userId) })
      .select('date')
      .sort({ date: -1 })
      .exec();
    const daySet = new Set(checkIns.map((c) => startOfUtcDay(c.date).getTime()));
    const todayMs = startOfUtcDay(now).getTime();

    if (!period) {
      return {
        period: null,
        streak: streakFrom(daySet, now),
        checkedInToday: daySet.has(todayMs),
        totalCheckIns: checkIns.length,
        daysTotal: 0,
        daysElapsed: 0,
        daysRemaining: 0,
        isActive: false,
        quote: null,
      };
    }

    const daysTotal = dayDiff(period.endDate, period.startDate) + 1;
    const rawElapsed = dayDiff(now, period.startDate) + 1;
    const daysElapsed = Math.max(0, Math.min(rawElapsed, daysTotal));
    const daysRemaining = Math.max(0, daysTotal - daysElapsed);
    const isActive =
      now.getTime() >= startOfUtcDay(period.startDate).getTime() &&
      now.getTime() < startOfUtcDay(period.endDate).getTime() + DAY_MS;
    const quotes = period.motivationalQuotes ?? [];
    const quote = quotes.length ? quotes[Math.max(0, daysElapsed - 1) % quotes.length] : null;

    return {
      period,
      streak: streakFrom(daySet, now),
      checkedInToday: daySet.has(todayMs),
      totalCheckIns: checkIns.length,
      daysTotal,
      daysElapsed,
      daysRemaining,
      isActive,
      quote,
    };
  }

  async checkIn(userId: string): Promise<MilitaryStatus> {
    const period = await this.getPeriod();
    if (!period) {
      throw new BadRequestException('لم يُحدَّد موعد التربية العسكرية بعد');
    }
    const now = new Date();
    const withinPeriod =
      now.getTime() >= startOfUtcDay(period.startDate).getTime() &&
      now.getTime() < startOfUtcDay(period.endDate).getTime() + DAY_MS;
    if (!withinPeriod) {
      throw new BadRequestException('تسجيل الحضور متاح فقط خلال فترة التربية العسكرية');
    }

    const today = startOfUtcDay(now);
    try {
      await this.checkInModel.create({ user: new Types.ObjectId(userId), date: today });
      // Only reached when the row was newly created -- a duplicate throws below and is swallowed,
      // so points are never awarded twice for the same day.
      await this.gamificationService.awardPoints(userId, POINTS.DAILY_LOGIN);
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }

    return this.getMyStatus(userId);
  }

  // --- Per-student daily time window ("my session runs from -> to") ---

  async getSettings(userId: string): Promise<MilitaryStudentSettingsDocument> {
    return this.settingsModel
      .findOneAndUpdate(
        { user: new Types.ObjectId(userId) },
        { $setOnInsert: { user: new Types.ObjectId(userId) } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async updateSettings(userId: string, dto: UpdateMilitarySettingsDto): Promise<MilitaryStudentSettingsDocument> {
    const set: Record<string, unknown> = {};
    if (dto.dailyStartTime !== undefined) set.dailyStartTime = dto.dailyStartTime || null;
    if (dto.dailyEndTime !== undefined) set.dailyEndTime = dto.dailyEndTime || null;
    if (
      set.dailyStartTime &&
      set.dailyEndTime &&
      (set.dailyStartTime as string) >= (set.dailyEndTime as string)
    ) {
      throw new BadRequestException('وقت النهاية يجب أن يكون بعد وقت البداية');
    }
    return this.settingsModel
      .findOneAndUpdate(
        { user: new Types.ObjectId(userId) },
        { $set: set, $setOnInsert: { user: new Types.ObjectId(userId) } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  // --- Per-student private to-do list ---

  async listTodos(userId: string): Promise<MilitaryTodoDocument[]> {
    return this.todoModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ order: 1, createdAt: 1 })
      .exec();
  }

  async addTodo(userId: string, dto: CreateMilitaryTodoDto): Promise<MilitaryTodoDocument> {
    const last = await this.todoModel
      .findOne({ user: new Types.ObjectId(userId) })
      .sort({ order: -1 })
      .select('order')
      .exec();
    return this.todoModel.create({
      user: new Types.ObjectId(userId),
      text: dto.text.trim(),
      order: (last?.order ?? 0) + 1,
    });
  }

  async updateTodo(userId: string, id: string, dto: UpdateMilitaryTodoDto): Promise<MilitaryTodoDocument> {
    const set: Record<string, unknown> = {};
    if (dto.text !== undefined) set.text = dto.text.trim();
    if (dto.done !== undefined) set.done = dto.done;
    const todo = await this.todoModel
      .findOneAndUpdate({ _id: id, user: new Types.ObjectId(userId) }, { $set: set }, { new: true })
      .exec();
    if (!todo) throw new NotFoundException('المهمة غير موجودة');
    return todo;
  }

  async deleteTodo(userId: string, id: string): Promise<void> {
    const res = await this.todoModel.findOneAndDelete({ _id: id, user: new Types.ObjectId(userId) }).exec();
    if (!res) throw new NotFoundException('المهمة غير موجودة');
  }

  // Admin/professor only (guarded at the controller). Per-student military-assignment progress
  // plus attendance, computed with a few grouped queries rather than an N+1 loop. When an admin
  // has uploaded a unit roster the list is scoped to its matched accounts, and the names that
  // matched nobody ride along under `unmatchedNames`; with no roster uploaded it falls back to
  // every student account.
  async getRoster(): Promise<{
    totalAssignments: number;
    students: MilitaryRosterEntry[];
    rosterCount: number;
    unmatchedNames: string[];
  }> {
    const rosterMembers = await this.rosterModel.find().select('rawName matchedUser').exec();
    const matchedIds = rosterMembers
      .filter((m) => m.matchedUser)
      .map((m) => m.matchedUser as Types.ObjectId);
    const unmatchedNames = rosterMembers
      .filter((m) => !m.matchedUser)
      .map((m) => m.rawName)
      .sort((a, b) => a.localeCompare(b));

    const studentFilter = rosterMembers.length
      ? { role: Role.STUDENT, _id: { $in: matchedIds } }
      : { role: Role.STUDENT };

    const [students, totalAssignments, completionRows, checkInRows] = await Promise.all([
      this.userModel.find(studentFilter).select('name photoUrl collegeId').sort({ name: 1 }).exec(),
      this.assignmentModel.countDocuments({ isMilitary: true }).exec(),
      this.assignmentModel
        .aggregate<{ _id: Types.ObjectId; completed: number }>([
          { $match: { isMilitary: true } },
          { $unwind: '$completedBy' },
          { $group: { _id: '$completedBy', completed: { $sum: 1 } } },
        ])
        .exec(),
      this.checkInModel.find().select('user date').sort({ date: 1 }).exec(),
    ]);

    const completedByUser = new Map(completionRows.map((r) => [r._id.toString(), r.completed]));
    const daysByUser = new Map<string, number[]>();
    for (const row of checkInRows) {
      const key = row.user.toString();
      const list = daysByUser.get(key) ?? [];
      list.push(startOfUtcDay(row.date).getTime());
      daysByUser.set(key, list);
    }

    const now = new Date();
    const rows: MilitaryRosterEntry[] = students.map((s) => {
      const id = s._id.toString();
      const days = daysByUser.get(id) ?? [];
      return {
        user: { _id: id, name: s.name, photoUrl: s.photoUrl, collegeId: s.collegeId },
        completed: completedByUser.get(id) ?? 0,
        total: totalAssignments,
        streak: streakFrom(new Set(days), now),
        attendedDays: days.length,
        lastCheckIn: days.length ? new Date(Math.max(...days)) : null,
      };
    });

    rows.sort((a, b) => b.completed - a.completed || b.streak - a.streak || a.user.name.localeCompare(b.user.name));
    return { totalAssignments, students: rows, rosterCount: rosterMembers.length, unmatchedNames };
  }
}
