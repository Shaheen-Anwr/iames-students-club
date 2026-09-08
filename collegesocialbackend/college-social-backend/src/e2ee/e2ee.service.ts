import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { E2eePreKey, E2eePreKeyDocument } from './schemas/e2ee-prekey.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AddPreKeysDto, RegisterKeysDto } from './dto/register-keys.dto';

// Public-key registry for the X3DH handshake (docs/e2ee-design.md §6). The server never sees
// plaintext or private keys -- it just stores public bundles and hands out one-time prekeys.
@Injectable()
export class E2eeService {
  constructor(
    @InjectModel(E2eePreKey.name) private readonly preKeyModel: Model<E2eePreKeyDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  private assertEnabled(): void {
    if (!this.config.get<boolean>('e2eeEnabled')) {
      throw new ForbiddenException('التشفير من طرف إلى طرف غير مفعّل بعد.');
    }
  }

  /** Register (or fully replace) the caller's key bundle + reset their one-time prekey pool. */
  async registerKeys(userId: string, dto: RegisterKeysDto): Promise<{ oneTimePreKeysLeft: number }> {
    this.assertEnabled();
    const uid = new Types.ObjectId(userId);

    await this.userModel
      .updateOne(
        { _id: uid },
        {
          $set: {
            e2ee: {
              identityKey: dto.identityKey,
              identitySig: dto.identitySig,
              signedPreKey: { ...dto.signedPreKey, createdAt: new Date() },
              registeredAt: new Date(),
            },
          },
        },
      )
      .exec();

    // Replacing the bundle invalidates every old prekey.
    await this.preKeyModel.deleteMany({ user: uid }).exec();
    await this.insertPreKeys(uid, dto.oneTimePreKeys);

    return { oneTimePreKeysLeft: dto.oneTimePreKeys.length };
  }

  /** Top up the one-time prekey pool (client calls when the count runs low). */
  async addPreKeys(userId: string, dto: AddPreKeysDto): Promise<{ oneTimePreKeysLeft: number }> {
    this.assertEnabled();
    const uid = new Types.ObjectId(userId);
    const user = await this.userModel.findById(uid).select('e2ee').lean().exec();
    if (!user?.e2ee) throw new ForbiddenException('سجّل مفاتيح التشفير أولًا.');
    await this.insertPreKeys(uid, dto.oneTimePreKeys);
    return { oneTimePreKeysLeft: await this.preKeyModel.countDocuments({ user: uid }).exec() };
  }

  private async insertPreKeys(uid: Types.ObjectId, keys: { keyId: number; publicKey: string }[]): Promise<void> {
    if (keys.length === 0) return;
    // Ignore duplicate (user,keyId) collisions from a retried request rather than 500.
    await this.preKeyModel
      .insertMany(
        keys.map((k) => ({ user: uid, keyId: k.keyId, publicKey: k.publicKey })),
        { ordered: false },
      )
      .catch((err: { code?: number }) => {
        if (err?.code !== 11000) throw err;
      });
  }

  /** The other side of a handshake: peer's identity + signed prekey, and one popped one-time prekey. */
  async getBundle(targetUserId: string): Promise<{
    identityKey: string;
    identitySig: string;
    signedPreKey: { key: string; sig: string; id: number };
    oneTimePreKey: { keyId: number; publicKey: string } | null;
  }> {
    this.assertEnabled();
    if (!Types.ObjectId.isValid(targetUserId)) throw new NotFoundException('المستخدم غير موجود');
    const uid = new Types.ObjectId(targetUserId);
    const user = await this.userModel.findById(uid).select('e2ee').lean().exec();
    if (!user?.e2ee) throw new NotFoundException('لم يفعّل هذا المستخدم التشفير بعد.');

    const opk = await this.preKeyModel.findOneAndDelete({ user: uid }).lean().exec();

    return {
      identityKey: user.e2ee.identityKey,
      identitySig: user.e2ee.identitySig,
      signedPreKey: {
        key: user.e2ee.signedPreKey.key,
        sig: user.e2ee.signedPreKey.sig,
        id: user.e2ee.signedPreKey.id,
      },
      oneTimePreKey: opk ? { keyId: opk.keyId, publicKey: opk.publicKey } : null,
    };
  }

  /** Just the identity key -- for the safety-number screen and key-change detection. No pop. */
  async getIdentity(targetUserId: string): Promise<{ identityKey: string }> {
    this.assertEnabled();
    if (!Types.ObjectId.isValid(targetUserId)) throw new NotFoundException('المستخدم غير موجود');
    const user = await this.userModel.findById(targetUserId).select('e2ee.identityKey').lean().exec();
    if (!user?.e2ee) throw new NotFoundException('لم يفعّل هذا المستخدم التشفير بعد.');
    return { identityKey: user.e2ee.identityKey };
  }

  async status(
    userId: string,
  ): Promise<{ enabled: boolean; registered: boolean; oneTimePreKeysLeft: number; hasBackup: boolean }> {
    const enabled = !!this.config.get<boolean>('e2eeEnabled');
    if (!enabled) return { enabled: false, registered: false, oneTimePreKeysLeft: 0, hasBackup: false };
    const uid = new Types.ObjectId(userId);
    const [user, left] = await Promise.all([
      this.userModel.findById(uid).select('e2ee.registeredAt e2eeBackup.updatedAt').lean().exec(),
      this.preKeyModel.countDocuments({ user: uid }).exec(),
    ]);
    return { enabled, registered: !!user?.e2ee, oneTimePreKeysLeft: left, hasBackup: !!user?.e2eeBackup };
  }

  // --- passphrase key backup (P6) --------------------------------------------------------------
  async getBackup(userId: string): Promise<{ blob: string | null; updatedAt: string | null }> {
    this.assertEnabled();
    const user = await this.userModel.findById(userId).select('e2eeBackup').lean().exec();
    return {
      blob: user?.e2eeBackup?.blob ?? null,
      updatedAt: user?.e2eeBackup?.updatedAt?.toISOString() ?? null,
    };
  }

  async putBackup(userId: string, blob: string): Promise<{ updatedAt: string }> {
    this.assertEnabled();
    const updatedAt = new Date();
    await this.userModel
      .updateOne({ _id: new Types.ObjectId(userId) }, { $set: { e2eeBackup: { blob, updatedAt } } })
      .exec();
    return { updatedAt: updatedAt.toISOString() };
  }

  async deleteBackup(userId: string): Promise<void> {
    this.assertEnabled();
    await this.userModel
      .updateOne({ _id: new Types.ObjectId(userId) }, { $set: { e2eeBackup: null } })
      .exec();
  }
}
