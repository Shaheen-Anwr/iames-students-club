/**
 * One-off backfill: stamp a شعبة onto legacy study groups / assignments / quizzes / public
 * questions that predate the `department` field.
 *
 * The group explorer, the الواجبات / اختبارات boards, the course hub and the أسئلة tabs now wall
 * content STRICTLY by شعبة -- a viewer with a شعبة sees ONLY their own شعبة's rows, with no
 * college-wide (null) fallback. Any row still sitting at `department: null` is therefore invisible
 * to every student. New rows can't hit this (the create paths snapshot the creator's شعبة). This
 * walks every affected legacy row and, when its owner/creator/author has a شعبة, copies that شعبة
 * onto the row so it becomes visible again to that شعبة's students.
 *
 * Left untouched (and REPORTED at the end so you can fix them by hand): rows whose owner is an
 * admin / has no شعبة / no longer exists -- there's no شعبة to copy. Under strict scoping these
 * stay invisible to students until an admin edits them onto a real شعبة.
 *
 * NOT touched: group-scoped assignments/quizzes/questions (membership-gated, `department` unused),
 * military assignments (`isMilitary` -- deliberately university-wide), and personal assignments
 * (creator-only anyway, but they still get stamped so a future non-personal edit inherits it).
 *
 * Idempotent -- it only ever reads/writes rows still at `department: null`.
 *
 * Build first (`npm run build`), then:
 *   node dist/scripts/backfill-content-departments.js --dry-run
 *   node dist/scripts/backfill-content-departments.js
 *
 * Needs the same env as the server: MONGODB_URI (+ nothing else).
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { StudyGroup } from '../groups/schemas/study-group.schema';
import { Assignment } from '../assignments/schemas/assignment.schema';
import { Quiz } from '../quizzes/schemas/quiz.schema';
import { Question } from '../qa/schemas/question.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';

interface OwnedRow {
  _id: Types.ObjectId;
  label: string;
  ownerId: Types.ObjectId | null | undefined;
}

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const groupModel = app.get<Model<StudyGroup>>(getModelToken(StudyGroup.name));
    const assignmentModel = app.get<Model<Assignment>>(getModelToken(Assignment.name));
    const quizModel = app.get<Model<Quiz>>(getModelToken(Quiz.name));
    const questionModel = app.get<Model<Question>>(getModelToken(Question.name));
    const userModel = app.get<Model<User>>(getModelToken(User.name));

    const deptCache = new Map<string, { role: string; department: string | null; name: string } | null>();
    const resolveOwner = async (id: Types.ObjectId | null | undefined) => {
      if (!id) return null;
      const key = id.toString();
      if (!deptCache.has(key)) {
        deptCache.set(key, await userModel.findById(id).select('role department name').lean().exec());
      }
      return deptCache.get(key) ?? null;
    };

    const runCollection = async (
      collLabel: string,
      rows: OwnedRow[],
      setDept: (id: Types.ObjectId, dept: string) => Promise<unknown>,
    ) => {
      console.log(`\n== ${collLabel}: ${rows.length} row(s) with no شعبة ==`);
      let retagged = 0;
      const manual: string[] = [];
      for (const row of rows) {
        const owner = await resolveOwner(row.ownerId);
        if (!owner || owner.role === Role.ADMIN || !owner.department) {
          const reason = !owner ? 'owner account gone' : owner.role === Role.ADMIN ? 'admin owner' : 'owner has no شعبة';
          manual.push(`${collLabel} "${row.label}" (${reason}) _id=${row._id}`);
          continue;
        }
        console.log(`${dryRun ? '[dry-run] would set' : 'set'} ${collLabel} "${row.label}" -> ${owner.department} (${owner.name})`);
        if (!dryRun) await setDept(row._id, owner.department);
        retagged += 1;
      }
      console.log(`  ${dryRun ? 'would re-tag' : 're-tagged'}: ${retagged}  |  needs manual شعبة: ${manual.length}`);
      for (const line of manual) console.log(`   - ${line}`);
    };

    const groups = await groupModel.find({ department: null }).select('_id name owner').lean().exec();
    await runCollection(
      'group',
      groups.map((g) => ({ _id: g._id, label: g.name ?? String(g._id), ownerId: g.owner })),
      (id, dept) => groupModel.updateOne({ _id: id }, { $set: { department: dept } }).exec(),
    );

    const assignments = await assignmentModel
      .find({ department: null, group: null, isMilitary: { $ne: true } })
      .select('_id title createdBy')
      .lean()
      .exec();
    await runCollection(
      'assignment',
      assignments.map((a) => ({ _id: a._id, label: a.title ?? String(a._id), ownerId: a.createdBy })),
      (id, dept) => assignmentModel.updateOne({ _id: id }, { $set: { department: dept } }).exec(),
    );

    const quizzes = await quizModel.find({ department: null, group: null }).select('_id title createdBy').lean().exec();
    await runCollection(
      'quiz',
      quizzes.map((q) => ({ _id: q._id, label: q.title ?? String(q._id), ownerId: q.createdBy })),
      (id, dept) => quizModel.updateOne({ _id: id }, { $set: { department: dept } }).exec(),
    );

    const questions = await questionModel
      .find({ department: null, group: null })
      .select('_id title author')
      .lean()
      .exec();
    await runCollection(
      'question',
      questions.map((q) => ({ _id: q._id, label: q.title ?? String(q._id), ownerId: q.author })),
      (id, dept) => questionModel.updateOne({ _id: id }, { $set: { department: dept } }).exec(),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
