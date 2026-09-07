/**
 * One-off backfill: file legacy "كل الشعب" (department-less) lecture/video uploads under their
 * uploader's own شعبة.
 *
 * Since the شعبة wall shipped, a professor can no longer upload course material without a شعبة --
 * PostsService.create() forces every non-admin lecture/video under the author's own department (and
 * the upload form hides the "كل الشعب" option). Older uploads created before that may still sit at
 * `department: null`, which "own + college-wide" scoping shows to EVERY شعبة. This walks every
 * lecture/video post with `department: null` and, when its author is a professor who has a شعبة,
 * stamps that شعبة onto the post so it stops leaking across شعب.
 *
 * Deliberately left untouched: material authored by an admin (or by a user with no department, or
 * whose account is gone) -- an admin's department-less upload is treated as a genuine college-wide
 * resource, which is exactly what "own + college-wide" is meant to keep visible to everyone.
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
    let skippedAdmin = 0;
    let skippedNoDept = 0;

    for (const post of orphans) {
      const author = post.author
        ? await userModel.findById(post.author).select('role department name').lean().exec()
        : null;

      if (!author || author.role === Role.ADMIN) {
        skippedAdmin += 1;
        continue;
      }
      if (!author.department) {
        skippedNoDept += 1;
        continue;
      }

      const label = post.courseCode || post.caption?.slice(0, 40) || String(post._id);
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
    console.log(`Left as college-wide (admin / no author): ${skippedAdmin}`);
    console.log(`Left as college-wide (author has no شعبة): ${skippedNoDept}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
