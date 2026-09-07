// X3DH key agreement (docs/e2ee-design.md §3). Produces the 32-byte shared secret SK that seeds
// the Double Ratchet, plus the handshake header the initiator sends with its first message.

import {
  concatBytes,
  ecdh,
  exportPublic,
  generateECDH,
  hkdf,
  importECDHPublic,
  importECDSAPublic,
  randomBytes,
  unb64,
  verify,
  type Bytes,
} from './crypto';

const X3DH_INFO = 'iaems-x3dh-v1';
const ZERO_SALT = new Uint8Array(32) as Bytes;

export interface PeerBundle {
  identityKey: string; // b64 spki ECDH
  identitySig: string; // b64 spki ECDSA (verifies signedPreKey.sig)
  signedPreKey: { key: string; sig: string; id: number };
  oneTimePreKey: { keyId: number; publicKey: string } | null;
}

export interface X3DHHeader {
  ik: string; // b64 spki of initiator's identity ECDH public key
  ek: string; // b64 spki of initiator's ephemeral ECDH public key
  opkId: number | null;
}

export interface InitiateResult {
  sk: Bytes;
  header: X3DHHeader;
  /** The responder's signed-prekey public — the initiator's initial `DHr` for the ratchet handoff. */
  theirSignedPreKeyPub: string;
}

/**
 * Initiator side. `myIdentity` is our long-term ECDH keypair (public part goes in the header).
 * Throws if the peer's signed-prekey signature doesn't verify against their identity signing key.
 */
export async function initiateX3DH(
  myIdentity: { priv: CryptoKey; pub: CryptoKey },
  bundle: PeerBundle,
): Promise<InitiateResult> {
  const idSigPub = await importECDSAPublic(bundle.identitySig);
  const sigOk = await verify(idSigPub, bundle.signedPreKey.sig, unb64(bundle.signedPreKey.key));
  if (!sigOk) throw new Error('E2EE: peer signed-prekey signature invalid — refusing handshake');

  const ek = await generateECDH(false);
  const ikB = await importECDHPublic(bundle.identityKey);
  const spkB = await importECDHPublic(bundle.signedPreKey.key);

  const dh1 = await ecdh(myIdentity.priv, spkB); // ECDH(IK_A, SPK_B)
  const dh2 = await ecdh(ek.privateKey, ikB); //  ECDH(EK_A, IK_B)
  const dh3 = await ecdh(ek.privateKey, spkB); //  ECDH(EK_A, SPK_B)
  let ikm = concatBytes(dh1, dh2, dh3);
  let opkId: number | null = null;
  if (bundle.oneTimePreKey) {
    const opkB = await importECDHPublic(bundle.oneTimePreKey.publicKey);
    ikm = concatBytes(ikm, await ecdh(ek.privateKey, opkB)); // ECDH(EK_A, OPK_B)
    opkId = bundle.oneTimePreKey.keyId;
  }

  const sk = await hkdf(ikm, ZERO_SALT, X3DH_INFO, 32);
  return {
    sk,
    header: { ik: await exportPublic(myIdentity.pub), ek: await exportPublic(ek.publicKey), opkId },
    theirSignedPreKeyPub: bundle.signedPreKey.key,
  };
}

/**
 * Responder side. `mySignedPreKeyPriv` is our current signed-prekey private; `myOneTimePreKeyPriv`
 * is the one matching `header.opkId` (resolved from the local store by the caller), or null.
 */
export async function respondX3DH(
  myIdentityPriv: CryptoKey,
  mySignedPreKeyPriv: CryptoKey,
  myOneTimePreKeyPriv: CryptoKey | null,
  header: X3DHHeader,
): Promise<Bytes> {
  const ikA = await importECDHPublic(header.ik);
  const ekA = await importECDHPublic(header.ek);

  const dh1 = await ecdh(mySignedPreKeyPriv, ikA); // mirror ECDH(IK_A, SPK_B)
  const dh2 = await ecdh(myIdentityPriv, ekA); //     mirror ECDH(EK_A, IK_B)
  const dh3 = await ecdh(mySignedPreKeyPriv, ekA); // mirror ECDH(EK_A, SPK_B)
  let ikm = concatBytes(dh1, dh2, dh3);
  if (header.opkId != null && myOneTimePreKeyPriv) {
    ikm = concatBytes(ikm, await ecdh(myOneTimePreKeyPriv, ekA)); // mirror ECDH(EK_A, OPK_B)
  }
  return hkdf(ikm, ZERO_SALT, X3DH_INFO, 32);
}

export { randomBytes };
