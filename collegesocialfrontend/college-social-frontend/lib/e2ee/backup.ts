// Passphrase key backup / restore (docs/e2ee-design.md §7, phase P6).
//
// Backs up the irreplaceable part -- the long-term identity keypair (+ the current signed
// prekey) -- encrypted under a passphrase (PBKDF2-SHA-256 -> AES-256-GCM). Restoring keeps the
// SAME identity key, so contacts never see a "security code changed" warning. Sessions and the
// decrypted-message cache are NOT in the backup: on a restored device, conversations re-handshake
// on the next message and history starts empty (same limit as a post-ratchet reload).

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  b64,
  exportPrivate,
  exportPublic,
  fromUtf8,
  importECDHPrivate,
  importECDHPublic,
  importECDSAPrivate,
  importECDSAPublic,
  pbkdf2,
  randomBytes,
  unb64,
  utf8,
  type Bytes,
} from './crypto';
import { getIdentity, getSpk, putIdentity, putSpk } from './store';

const MAGIC = 'iaems-e2ee-backup';
const PBKDF2_ITERS = 600_000;

interface BackupPlain {
  v: 1;
  userId: string;
  createdAt: number;
  identity: { ikPriv: string; ikPub: string; ikSigPriv: string; ikSigPub: string };
  spk: { id: number; priv: string; pub: string } | null;
}

interface BackupEnvelope {
  magic: typeof MAGIC;
  v: 1;
  kdf: { salt: string; iters: number };
  iv: string;
  ct: string;
}

/** Serialize + passphrase-encrypt this device's identity. Returns the envelope JSON string. */
export async function createBackup(passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error('كلمة المرور قصيرة جدًا (٨ أحرف على الأقل).');
  const id = await getIdentity();
  if (!id) throw new Error('لا توجد مفاتيح تشفير على هذا الجهاز.');

  let ikPriv: string;
  let ikSigPriv: string;
  try {
    ikPriv = await exportPrivate(id.ikPriv);
    ikSigPriv = await exportPrivate(id.ikSigPriv);
  } catch {
    throw new Error('مفاتيح هذا الجهاز أُنشئت بصيغة غير قابلة للنسخ. أعد تعيينها ثم أنشئ نسخة جديدة.');
  }

  const spk = await getSpk();
  const plain: BackupPlain = {
    v: 1,
    userId: id.userId,
    createdAt: Date.now(),
    identity: {
      ikPriv,
      ikPub: await exportPublic(id.ikPub),
      ikSigPriv,
      ikSigPub: await exportPublic(id.ikSigPub),
    },
    spk: spk ? { id: spk.id, priv: await exportPrivate(spk.priv), pub: spk.pub } : null,
  };

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await pbkdf2(passphrase, salt, PBKDF2_ITERS);
  const ct = await aesGcmEncrypt(key, utf8(JSON.stringify(plain)), iv);

  const envelope: BackupEnvelope = {
    magic: MAGIC,
    v: 1,
    kdf: { salt: b64(salt), iters: PBKDF2_ITERS },
    iv: b64(iv),
    ct: b64(ct),
  };
  return JSON.stringify(envelope);
}

/**
 * Decrypt a backup envelope with `passphrase` and write the identity (+ signed prekey) into this
 * device's store. Throws a friendly Arabic message on a wrong passphrase / corrupt file.
 * Does NOT re-publish -- the caller runs `republishAfterRestore` next.
 */
export async function restoreBackup(passphrase: string, envelopeJson: string): Promise<{ userId: string }> {
  let env: BackupEnvelope;
  try {
    env = JSON.parse(envelopeJson);
  } catch {
    throw new Error('ملف النسخة الاحتياطية غير صالح.');
  }
  if (env?.magic !== MAGIC || env.v !== 1 || !env.kdf?.salt || !env.iv || !env.ct) {
    throw new Error('هذا ليس ملف نسخة احتياطية صالحًا.');
  }

  const key = await pbkdf2(passphrase, unb64(env.kdf.salt), env.kdf.iters || PBKDF2_ITERS);
  let plainBytes: Bytes;
  try {
    plainBytes = await aesGcmDecrypt(key, unb64(env.ct), unb64(env.iv));
  } catch {
    throw new Error('كلمة المرور غير صحيحة.');
  }

  let plain: BackupPlain;
  try {
    plain = JSON.parse(fromUtf8(plainBytes));
  } catch {
    throw new Error('تعذّر قراءة محتوى النسخة الاحتياطية.');
  }
  if (plain.v !== 1 || !plain.userId || !plain.identity) {
    throw new Error('صيغة النسخة الاحتياطية غير مدعومة.');
  }

  const [ikPriv, ikPub, ikSigPriv, ikSigPub] = await Promise.all([
    importECDHPrivate(plain.identity.ikPriv),
    importECDHPublic(plain.identity.ikPub),
    importECDSAPrivate(plain.identity.ikSigPriv),
    importECDSAPublic(plain.identity.ikSigPub),
  ]);
  await putIdentity({ userId: plain.userId, ikPriv, ikPub, ikSigPriv, ikSigPub, createdAt: plain.createdAt });

  if (plain.spk) {
    await putSpk({
      id: plain.spk.id,
      priv: await importECDHPrivate(plain.spk.priv),
      pub: plain.spk.pub,
      createdAt: plain.createdAt,
    });
  }

  return { userId: plain.userId };
}
