/**
 * One-off cleanup after shelving chat end-to-end encryption (2026-09-08).
 *
 * While E2EE was briefly live in production, some messages were stored as opaque ciphertext
 * (`encrypted: true`, blank `text`, undecryptable `payload`) and their conversations were flipped
 * to the sticky `e2ee: true`. With the feature turned off those messages can never be read by
 * anyone (the keys only ever lived in the two browsers), and the sticky flag keeps the client
 * trying to encrypt. This script:
 *
 *   1. deletes every `encrypted: true` message (ciphertext + control carriers)
 *   2. clears `Conversation.e2ee` everywhere, and repairs `lastMessage*` on any conversation
 *      whose last message was one of the deleted ones
 *   3. clears the published key material (`User.e2ee`, `User.e2eeBackup`, the E2eePreKey pool)
 *
 * Build first (`npm run build`), then:
 *   node dist/scripts/disable-e2ee-cleanup.js --dry-run
 *   node dist/scripts/disable-e2ee-cleanup.js
 *
 * Needs the same env as the server: MONGODB_URI.
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { Conversation } from '../chat/schemas/conversation.schema';
import { Message } from '../chat/schemas/message.schema';
import { User } from '../users/schemas/user.schema';
import { E2eePreKey } from '../e2ee/schemas/e2ee-prekey.schema';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const conversationModel = app.get<Model<Conversation>>(getModelToken(Conversation.name));
  const messageModel = app.get<Model<Message>>(getModelToken(Message.name));
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const preKeyModel = app.get<Model<E2eePreKey>>(getModelToken(E2eePreKey.name));

  const encryptedCount = await messageModel.countDocuments({ encrypted: true }).exec();
  const e2eeConvCount = await conversationModel.countDocuments({ e2ee: true }).exec();
  const keyedUsers = await userModel.countDocuments({ e2ee: { $ne: null } }).exec();
  const backupUsers = await userModel.countDocuments({ e2eeBackup: { $ne: null } }).exec();
  const preKeys = await preKeyModel.countDocuments({}).exec();

  console.log('--- to clean up ---');
  console.log(`  encrypted messages:      ${encryptedCount}`);
  console.log(`  e2ee conversations:      ${e2eeConvCount}`);
  console.log(`  users with a key bundle: ${keyedUsers}`);
  console.log(`  users with a backup:     ${backupUsers}`);
  console.log(`  one-time prekeys:        ${preKeys}`);

  if (dryRun) {
    console.log('\n(dry run -- nothing written)');
    await app.close();
    return;
  }

  // 1. which conversations held an encrypted message, and their newest surviving message
  const affected = (await messageModel.distinct('conversation', { encrypted: true }).exec()) as Types.ObjectId[];

  const del = await messageModel.deleteMany({ encrypted: true }).exec();
  console.log(`\ndeleted ${del.deletedCount} encrypted messages`);

  let repaired = 0;
  for (const convId of affected) {
    const last = (await messageModel
      .findOne({ conversation: convId, deletedForEveryone: { $ne: true } })
      .sort({ createdAt: -1 })
      .select('_id text attachments createdAt')
      .lean()
      .exec()) as
      | { _id: Types.ObjectId; text?: string; attachments?: unknown[]; createdAt?: Date }
      | null;
    if (last) {
      const preview = last.text?.slice(0, 120) || (last.attachments?.length ? 'مرفق' : '');
      await conversationModel
        .updateOne(
          { _id: convId },
          {
            $set: {
              e2ee: false,
              lastMessageId: last._id,
              lastMessageAt: last.createdAt ?? new Date(),
              lastMessagePreview: preview,
            },
          },
        )
        .exec();
    } else {
      await conversationModel
        .updateOne(
          { _id: convId },
          { $set: { e2ee: false, lastMessageId: null, lastMessageAt: null, lastMessagePreview: null } },
        )
        .exec();
    }
    repaired++;
  }
  console.log(`repaired lastMessage* on ${repaired} conversations`);

  const convRes = await conversationModel.updateMany({ e2ee: true }, { $set: { e2ee: false } }).exec();
  console.log(`cleared e2ee flag on ${convRes.modifiedCount} more conversations`);

  const userRes = await userModel
    .updateMany({ $or: [{ e2ee: { $ne: null } }, { e2eeBackup: { $ne: null } }] }, { $set: { e2ee: null, e2eeBackup: null } })
    .exec();
  console.log(`cleared key material on ${userRes.modifiedCount} users`);

  const pkRes = await preKeyModel.deleteMany({}).exec();
  console.log(`deleted ${pkRes.deletedCount} one-time prekeys`);

  console.log('\ndone.');
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
