/**
 * One-off cleanup after removing chat end-to-end encryption (2026-09-08).
 *
 * While E2EE was briefly live in production, some messages were stored as opaque ciphertext
 * (`encrypted: true`, blank `text`, undecryptable `payload`) and their conversations were flipped
 * to the sticky `e2ee: true`. Those fields are gone from the schema now, so this script talks to
 * the raw collections. It:
 *
 *   1. deletes every `{ encrypted: true }` message (ciphertext + control carriers)
 *   2. repairs `lastMessage*` on any conversation whose last message was one of the deleted ones,
 *      and `$unset`s `e2ee` from every conversation
 *   3. `$unset`s `e2ee` / `e2eeBackup` from every user and drops the `e2eeprekeys` collection
 *
 * Build first (`npm run build`), then:
 *   node dist/scripts/disable-e2ee-cleanup.js --dry-run
 *   node dist/scripts/disable-e2ee-cleanup.js
 *
 * Needs the same env as the server: MONGODB_URI.
 */
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get<Connection>(getConnectionToken()).db;
  if (!db) throw new Error('no db handle');

  const messages = db.collection('messages');
  const conversations = db.collection('conversations');
  const users = db.collection('users');

  const encryptedCount = await messages.countDocuments({ encrypted: true });
  const e2eeConvCount = await conversations.countDocuments({ e2ee: { $exists: true } });
  const keyedUsers = await users.countDocuments({ $or: [{ e2ee: { $ne: null } }, { e2eeBackup: { $ne: null } }] });
  const preKeys = (await db.listCollections({ name: 'e2eeprekeys' }).toArray()).length
    ? await db.collection('e2eeprekeys').countDocuments({})
    : 0;

  console.log('--- to clean up ---');
  console.log(`  encrypted messages:            ${encryptedCount}`);
  console.log(`  conversations with e2ee field: ${e2eeConvCount}`);
  console.log(`  users with key material:       ${keyedUsers}`);
  console.log(`  one-time prekeys:              ${preKeys}`);

  if (dryRun) {
    console.log('\n(dry run -- nothing written)');
    await app.close();
    return;
  }

  const affected = (await messages.distinct('conversation', { encrypted: true })) as unknown[];
  const del = await messages.deleteMany({ encrypted: true });
  console.log(`\ndeleted ${del.deletedCount} encrypted messages`);

  let repaired = 0;
  for (const convId of affected) {
    const last = await messages
      .find({ conversation: convId, deletedForEveryone: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    const m = last[0];
    if (m) {
      const preview: string =
        (typeof m.text === 'string' && m.text.slice(0, 120)) ||
        (Array.isArray(m.attachments) && m.attachments.length ? 'مرفق' : '');
      await conversations.updateOne(
        { _id: convId as never },
        { $set: { lastMessageId: m._id, lastMessageAt: m.createdAt ?? new Date(), lastMessagePreview: preview }, $unset: { e2ee: '' } },
      );
    } else {
      await conversations.updateOne(
        { _id: convId as never },
        { $set: { lastMessageId: null, lastMessageAt: null, lastMessagePreview: null }, $unset: { e2ee: '' } },
      );
    }
    repaired++;
  }
  console.log(`repaired + unset e2ee on ${repaired} conversations`);

  const convRes = await conversations.updateMany({ e2ee: { $exists: true } }, { $unset: { e2ee: '' } });
  console.log(`unset e2ee on ${convRes.modifiedCount} more conversations`);

  const userRes = await users.updateMany(
    { $or: [{ e2ee: { $exists: true } }, { e2eeBackup: { $exists: true } }] },
    { $unset: { e2ee: '', e2eeBackup: '' } },
  );
  console.log(`unset key material on ${userRes.modifiedCount} users`);

  if ((await db.listCollections({ name: 'e2eeprekeys' }).toArray()).length) {
    await db.collection('e2eeprekeys').drop();
    console.log('dropped e2eeprekeys collection');
  }

  console.log('\ndone.');
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
