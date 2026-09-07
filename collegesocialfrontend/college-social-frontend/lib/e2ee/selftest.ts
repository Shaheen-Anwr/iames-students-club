// Self-verification for the E2EE protocol (no test runner in this project). Runs a full
// Alice <-> Bob exchange entirely in-process against the real WebCrypto: X3DH handshake, a DH
// ratchet in each direction, out-of-order delivery, and a "was offline" batch (skipped keys).
//
// Call `e2eeSelfTest()` from a dev page or the console; it returns { ok, log }.

import { b64, exportPublic, generateECDH, generateECDSA, sign, unb64 } from './crypto';
import { encodeInner, decodeInner, type DRHeader, type InnerEnvelope } from './envelope';
import { initiateX3DH, respondX3DH, type PeerBundle } from './x3dh';
import { initRatchetInitiator, initRatchetResponder, ratchetDecrypt, ratchetEncrypt } from './ratchet';

interface Wire {
  x3dh?: { ik: string; ek: string; opkId: number | null };
  header: DRHeader;
  ct: string;
  iv: string;
}

export async function e2eeSelfTest(): Promise<{ ok: boolean; log: string[] }> {
  const log: string[] = [];
  const assert = (cond: boolean, msg: string) => {
    log.push(`${cond ? '✓' : '✗'} ${msg}`);
    if (!cond) throw new Error(msg);
  };
  const CONV = 'conv-selftest';

  try {
    // --- Bob publishes a bundle ---------------------------------------------------------------
    const bobIk = await generateECDH(false);
    const bobIkSig = await generateECDSA(false);
    const bobSpk = await generateECDH(false);
    const bobSpkPub = await exportPublic(bobSpk.publicKey);
    const bobOpk = await generateECDH(false);
    const bundle: PeerBundle = {
      identityKey: await exportPublic(bobIk.publicKey),
      identitySig: await exportPublic(bobIkSig.publicKey),
      signedPreKey: { key: bobSpkPub, sig: await sign(bobIkSig.privateKey, unb64(bobSpkPub)), id: 1 },
      oneTimePreKey: { keyId: 7, publicKey: await exportPublic(bobOpk.publicKey) },
    };

    // --- Alice's identity ---------------------------------------------------------------------
    const aliceIk = await generateECDH(false);

    // --- X3DH -------------------------------------------------------------------------------
    const init = await initiateX3DH({ priv: aliceIk.privateKey, pub: aliceIk.publicKey }, bundle);
    const bobSk = await respondX3DH(bobIk.privateKey, bobSpk.privateKey, bobOpk.privateKey, init.header);
    assert(b64(init.sk) === b64(bobSk), 'X3DH shared secret matches on both sides');

    let alice = await initRatchetInitiator(init.sk, init.theirSignedPreKeyPub);
    let bob = await initRatchetResponder(bobSk, bobSpk);

    const send = async (
      from: 'alice' | 'bob',
      inner: InnerEnvelope,
    ): Promise<Wire> => {
      const st = from === 'alice' ? alice : bob;
      const r = await ratchetEncrypt(st, encodeInner(inner), CONV);
      if (from === 'alice') alice = r.state;
      else bob = r.state;
      return { header: r.header, ct: r.ct, iv: r.iv };
    };
    const recv = async (to: 'alice' | 'bob', w: Wire): Promise<InnerEnvelope> => {
      const st = to === 'alice' ? alice : bob;
      const r = await ratchetDecrypt(st, w.header, w.ct, w.iv, CONV);
      if (to === 'alice') alice = r.state;
      else bob = r.state;
      return decodeInner(r.plaintext);
    };
    const text = (b: string): InnerEnvelope => ({ k: 'text', body: b });

    // --- 1. Alice -> Bob --------------------------------------------------------------------
    const m1 = await send('alice', text('مرحبا يا بوب'));
    assert((await recv('bob', m1)).k === 'text', 'Bob decrypts Alice #1');

    // --- 2. Bob -> Alice (forces a DH ratchet on Alice's side) ---------------------------------
    const m2 = await send('bob', text('أهلا أليس'));
    const d2 = await recv('alice', m2);
    assert(d2.k === 'text' && d2.body === 'أهلا أليس', 'Alice decrypts Bob (DH ratchet)');

    // --- 3. Alice -> Bob again (another ratchet) --------------------------------------------
    const m3 = await send('alice', text('كيف الامتحانات؟'));
    assert((await recv('bob', m3)).k === 'text', 'Bob decrypts Alice #3');

    // --- 4. out-of-order: Alice sends #4 and #5, Bob gets #5 then #4 -------------------------
    const m4 = await send('alice', text('رسالة رقم أربعة'));
    const m5 = await send('alice', text('رسالة رقم خمسة'));
    const d5 = await recv('bob', m5);
    assert(d5.k === 'text' && d5.body === 'رسالة رقم خمسة', 'Bob decrypts #5 before #4');
    const d4 = await recv('bob', m4);
    assert(d4.k === 'text' && d4.body === 'رسالة رقم أربعة', 'Bob decrypts #4 from a stashed key');

    // --- 5. "was offline": Bob sends a burst, Alice catches up in order ---------------------
    const burst: Wire[] = [];
    for (let i = 0; i < 5; i++) burst.push(await send('bob', text(`burst ${i}`)));
    for (let i = 0; i < 5; i++) {
      const d = await recv('alice', burst[i]);
      assert(d.k === 'text' && d.body === `burst ${i}`, `Alice catches up burst ${i}`);
    }

    // --- 6. a non-text control message survives the same channel ----------------------------
    const mr = await send('alice', { k: 'reaction', target: 'x', emoji: '🔥', op: 'add' });
    const dr = await recv('bob', mr);
    assert(dr.k === 'reaction' && dr.emoji === '🔥', 'Bob decrypts a reaction control message');

    // --- 7. tamper detection: flip a ciphertext bit -> decrypt must throw -------------------
    const mt = await send('alice', text('tamper me'));
    const bad = unb64(mt.ct);
    bad[0] ^= 0x01;
    let threw = false;
    try {
      await ratchetDecrypt(bob, mt.header, b64(bad), mt.iv, CONV);
    } catch {
      threw = true;
    }
    assert(threw, 'A tampered ciphertext is rejected (GCM tag)');

    log.push('— all checks passed —');
    return { ok: true, log };
  } catch (e) {
    log.push(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, log };
  }
}
