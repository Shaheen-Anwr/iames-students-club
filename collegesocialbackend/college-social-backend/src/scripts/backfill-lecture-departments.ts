/**
 * One-off backfill: file legacy "كل الشعب" (department-less) lecture/video uploads under their
 * uploader's own شعبة.
 *
 * The lecture libraries + اكاديميا now wall material STRICTLY by شعبة -- a viewer with a شعبة sees
 * only their own شعبة's lectures, with NO college-wide (null) allowance -- so any lecture/video
 * still sitting at `department: null` is now invisible to every student. New uploads can't hit this
 * (PostsService.create() forces a شعبة on every lecture/video). This walks every lecture/video post
 * with `department: null` and, when its author is a professor who has a شعبة, stamps that شعبة onto
 * the post so it becomes visible again to that شعبة's students.
 *
 * Left untouched (and REPORTED at the end so you can fix them by hand): material whose author is an
 * admin / has no شعبة / no longer exists -- there's no author شعبة to copy, and under strict
 * scoping these stay invisible to students until an admin edits/re-uploads them under a real شعبة.
 *
 * Idempotent -- it only ever reads/writes rows still at `department: null`.
 *
 * Build first (`npm run build`), then:
 *   node dist/scripts/backfill-lecture-departments.js --dry-run
 *   node dist/scripts/backfill-lecture-departments.js
 *
 * Needs the same env as the server: MONGODB_URI (+ nothing else).
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Post } from '../posts/schemas/post.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const postModel = app.get<Model<Post>>(getModelToken(Post.name));
    const userModel = app.get<Model<User>>(getModelToken(User.name));

    const orphans = await postModel
      .find({ attachmentType: { $in: ['lecture', 'video'] }, department: null })
      .select('_id author attachmentType courseCode caption')
      .lean()
      .exec();

    console.log(`Found ${orphans.length} lecture/video post(s) with no شعبة.`);

    let retagged = 0;
    const needsManualFix: string[] = [];

    for (const post of orphans) {
      const author = post.author
        ? await userModel.findById(post.author).select('role department name').lean().exec()
        : null;

      const label = post.courseCode || post.caption?.slice(0, 40) || String(post._id);

      if (!author || author.role === Role.ADMIN || !author.department) {
        const reason = !author ? 'author account gone' : author.role === Role.ADMIN ? 'admin author' : 'author has no شعبة';
        needsManualFix.push(`${post.attachmentType} "${label}"  (${reason})  _id=${post._id}`);
        continue;
      }

      console.log(
        `${dryRun ? '[dry-run] would set' : 'set'} ${post.attachmentType} "${label}" -> ${author.department} (author: ${author.name})`,
      );
      if (!dryRun) {
        await postModel.updateOne({ _id: post._id }, { $set: { department: author.department } }).exec();
      }
      retagged += 1;
    }

    console.log('---');
    console.log(`${dryRun ? 'Would re-tag' : 'Re-tagged'}: ${retagged}`);
    console.log(`Still invisible to students -- fix the شعبة on these by hand: ${needsManualFix.length}`);
    for (const line of needsManualFix) console.log(`  - ${line}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
