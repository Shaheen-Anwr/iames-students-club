# End-to-end encryption for chat — design

Status: **draft, pre-implementation.** This is the spec to review before any ratchet code lands.

Goal: 1:1 direct messages are readable only by the two participants. The server (and anyone with
DB / log access) sees ciphertext + unavoidable metadata (who talked to whom, when, size). Match
WhatsApp's guarantees (Signal Protocol: X3DH + Double Ratchet → forward secrecy + post‑compromise
recovery); go beyond it on **transparency** (per‑message lock state, in‑app key verification,
explicit "who can read this").

Group chats stay plaintext in v1 (sender‑keys is a separate design).

---

## 1. Threat model

**In scope (must defend):**
- A curious or compromised server operator reading stored/relayed DM content.
- A DB dump / backup leak exposing DM history.
- A network attacker (already covered by TLS, but E2EE removes reliance on the server not being MITM'd against itself).
- A stolen device: past messages should not all be decryptable if a *session* key leaks (forward secrecy); a one‑time full compromise shouldn't grant permanent future access (post‑compromise security). Both come from the Double Ratchet.

**Out of scope (documented, not solved in v1):**
- Metadata: the server knows the social graph, timing, message counts, ciphertext lengths. (Sealed‑sender / padding is a v3 idea.)
- A malicious server serving a **wrong public key** for your peer → it can MITM. Mitigated, not eliminated, by **key‑verification UX** (safety numbers / QR) and **key‑change warnings**. Same posture as WhatsApp.
- Endpoint compromise (malware on the student's laptop reading the decrypted DOM / IndexedDB).
- Multi‑device: v1 is effectively single‑device per user (see §7).
- Backups: if the user clears site data with no key backup, history is unrecoverable (see §7).

---

## 2. Primitives

Browser‑native `crypto.subtle` only. **No third‑party crypto library** (keeps the CSP/allowlist story clean and the attack surface small).

| Purpose | Algorithm | Notes |
|---|---|---|
| Identity / DH keys | **ECDH P‑256** | Universally supported. `deriveBits`. Private keys stored **non‑extractable**. |
| Signatures (prekey signing, safety number is a hash not a sig) | **ECDSA P‑256** | Separate keypair from the ECDH identity key. |
| KDF (root/chain, X3DH) | **HKDF‑SHA‑256** | |
| Symmetric message encryption | **AES‑256‑GCM**, 96‑bit IV | IV = 4‑byte fixed prefix ⊕ 8‑byte message counter, per Double Ratchet convention; never reused within a chain key. |
| MAC in the chain KDF | **HMAC‑SHA‑256** | Chain‑key → message‑key derivation. |

> P‑256 vs X25519/Ed25519: Curve25519 is only reaching `crypto.subtle` in current browsers and coverage isn't universal for this app's users yet. P‑256 via WebCrypto is fine for this threat model. If Curve25519 coverage is solid at build time, swap it in — the protocol is curve‑agnostic.

---

## 3. Key agreement — X3DH (simplified for a web app)

Each user, on first login on a device with E2EE enabled, generates and **publishes a key bundle**:

- `IK` — identity ECDH keypair (long‑term). `IK_sig` — identity ECDSA keypair.
- `SPK` — signed prekey: an ECDH keypair, its public part signed by `IK_sig`. Rotated ~weekly by the client.
- `OPK[]` — a batch (e.g. 100) of one‑time ECDH prekeys. Public parts uploaded; server hands out **exactly one per session init and deletes it**. Client replenishes when the server reports the pool is low.

**Initiator (Alice → Bob), first message of a conversation:**
1. `GET /e2ee/keys/:bobId` → `{ IK_pub, IK_sig_pub, SPK_pub, SPK_sig, OPK_pub?, OPK_id? }`. Verify `SPK_sig` with `IK_sig_pub`; abort if it fails.
2. Generate ephemeral ECDH keypair `EK`.
3. Compute DH values (ECDH `deriveBits`, 256‑bit each):
   - `DH1 = ECDH(IK_A_priv, SPK_B_pub)`
   - `DH2 = ECDH(EK_A_priv, IK_B_pub)`
   - `DH3 = ECDH(EK_A_priv, SPK_B_pub)`
   - `DH4 = ECDH(EK_A_priv, OPK_B_pub)`  *(omitted if no OPK available)*
4. `SK = HKDF(salt = 0x00…, ikm = DH1 ‖ DH2 ‖ DH3 ‖ DH4, info = "iaems-x3dh-v1")` → 32 bytes.
5. Wipe `DH*` and `EK_priv` after use (best effort in JS).
6. The **first ciphertext's header** carries `{ IK_A_pub, EK_A_pub, OPK_id? }` so Bob can reconstruct `SK`. `IK_A_pub` doubles as the associated data / prekey binding.

**Responder (Bob):** on the first inbound message for a conversation with an X3DH header, run the mirrored DH set with his private `IK`, `SPK`, `OPK[OPK_id]`, derive the same `SK`, then delete that `OPK` private key.

Both sides now initialize the **Double Ratchet** with `SK` as the initial root key. Alice also seeds the ratchet with Bob's `SPK_pub` as his initial ratchet public key (standard X3DH→DR handoff).

---

## 4. Double Ratchet

Per conversation, each side stores ratchet state (in IndexedDB):

```
RootKey                     // 32B
DHs        { pub, priv }    // our current ratchet ECDH keypair
DHr        pub | null       // their latest ratchet public key we've seen
CKs, CKr   32B | null       // sending / receiving chain keys
Ns, Nr     int              // message # in current sending / receiving chain
PN         int              // # messages in the PREVIOUS sending chain
MKSKIPPED  Map<(DHr,N), MK> // skipped message keys, bounded to MAX_SKIP=1000, LRU-evicted
```

- **Send:** `(CKs, MK) = KDF_CK(CKs)`; `Ns++`. Header = `{ dh: DHs.pub, pn: PN, n: Ns-1 }`. Ciphertext = `AES-GCM(MK, plaintext, aad = serialize(header) ‖ conversationId)`.
- **Receive:** if `header.dh !== DHr` → **DH ratchet step**: store skipped keys from the old receiving chain up to `header.pn`, set `DHr = header.dh`, `RootKey, CKr = KDF_RK(RootKey, ECDH(DHs.priv, DHr))`, generate new `DHs`, `RootKey, CKs = KDF_RK(RootKey, ECDH(DHs.priv, DHr))`, `PN = Ns`, `Ns = Nr = 0`. Then skip forward on `CKr` to `header.n`, deriving/stashing intermediate `MK`s, derive the target `MK`, `Nr = header.n + 1`, decrypt (verify GCM tag → reject on failure).
- `KDF_RK(rk, dh)` = HKDF(salt=rk, ikm=dh, info="iaems-dr-rk") → (rk', ck).
- `KDF_CK(ck)` = `HMAC(ck, 0x01)` → mk, `HMAC(ck, 0x02)` → ck'.

**Skipped keys:** stored so out‑of‑order / offline‑batched delivery works. Bounded; on overflow, oldest evicted (those messages become permanently undecryptable — acceptable, extremely rare).

**Header encryption** (hiding `dh`/`n`): out of scope for v1. Metadata to the server, not to a passive network observer (TLS).

---

## 5. Wire format

`Message` in an E2EE conversation carries, instead of `text`:

```jsonc
{
  "e2ee": 1,                       // schema version
  "type": "msg" | "x3dh" ,         // x3dh = also carries the initial handshake header
  "x3dh": { "ik": b64, "ek": b64, "opkId": 42 },   // only on type:"x3dh"
  "dr":   { "dh": b64, "pn": 3, "n": 0 },           // Double Ratchet header
  "ct":   b64,                     // AES-GCM ciphertext (tag appended)
  "iv":   b64
}
```

The **plaintext inside** is itself a small JSON envelope so all message kinds ride the same channel:

```jsonc
{ "k": "text",     "body": "..." }
{ "k": "reaction", "target": "<msgId>", "emoji": "👍", "op": "add"|"remove" }
{ "k": "edit",     "target": "<msgId>", "body": "..." }
{ "k": "delete",   "target": "<msgId>" }            // delete-for-everyone tombstone
{ "k": "media",    "kind": "image"|"voice"|"file", "url": "...", "mk": b64, "iv": b64, "name": "...", "mime": "...", "size": 1234, "dur": 12 }
```

**Media**: the blob is encrypted client‑side with a fresh AES‑256‑GCM key `mk`, the ciphertext uploaded to Cloudinary as a raw asset, and `mk`/`iv`/`url` travel *inside* the encrypted message envelope. The server and Cloudinary only ever hold ciphertext. (v1 may ship text+reactions+edits and land media a step later — flagged separately.)

---

## 6. Backend data model & API

**`User`** — new subdoc `e2ee`:
```
identityKey:   string  (b64 SPKI ECDH pub)
identitySig:   string  (b64 SPKI ECDSA pub)
signedPreKey:  { key: string, sig: string, id: number, createdAt: Date }
registeredAt:  Date
```
Absent ⇒ user hasn't set up E2EE ⇒ their conversations stay plaintext.

**New collection `E2eePreKey`**: `{ user, keyId: number, publicKey: string, createdAt }` — one‑time prekeys. Unique `(user, keyId)`. Popped (`findOneAndDelete`) on session init.

**`Conversation`**: `e2ee: boolean` — set true iff `!isGroup` and both participants have `user.e2ee`. Computed at creation and lazily on first message; never flips back to false once true (a participant clearing keys ⇒ "can't decrypt", not "downgrade to plaintext").

**`Message`**: `encrypted: boolean` (default false); when true, `text` is `null` and `payload: string` (the §5 JSON) is set. `lastMessagePreview` on the conversation is `null` for encrypted convs.

**Endpoints** (`src/e2ee/`, guarded by `JwtAuthGuard`, gated by `E2EE_ENABLED` env):
- `POST /e2ee/keys` — register/replace the caller's bundle `{ identityKey, identitySig, signedPreKey, oneTimePreKeys: [{keyId, publicKey}] }`.
- `GET  /e2ee/keys/:userId` — returns `{ identityKey, identitySig, signedPreKey, oneTimePreKey? }`, popping one OPK. 404 if the user has no bundle.
- `POST /e2ee/keys/prekeys` — top up OPKs `[{keyId, publicKey}]`.
- `GET  /e2ee/keys/:userId/identity` — just `{ identityKey }`, for the safety‑number screen and key‑change checks. No pop.
- `GET  /e2ee/status` — `{ registered: boolean, oneTimePreKeysLeft: number }` for the client to know when to replenish.

Message send: the gateway/REST accepts `payload` + `encrypted:true` and stores as‑is; it does **not** parse it. Push fan‑out for an encrypted message sends a generic body (`📩 رسالة جديدة من <name>` — name is server‑side metadata).

---

## 7. Multi‑device & backup (v1 limitations, explicit)

- **v1 = one device holds the keys.** Identity + prekey private keys live in that browser's IndexedDB. Logging in on a second browser ⇒ that device has no keys ⇒ it prompts to **set up E2EE** which generates a *new* bundle and replaces the old one server‑side. Result: the old device's sessions break, and neither device can read history the other holds. This is bad UX and must be called out in the setup flow.
- **Key backup (fast‑follow):** export `{ IK_priv, IK_sig_priv, SPK_priv }` wrapped with `AES‑GCM(key = PBKDF2(passphrase, salt, 600k), ...)` → a downloadable blob / paste‑able string. Import on the new device restores identity (not per‑conversation ratchet state, so history still isn't transferred — that needs an encrypted history export, v2).
- **Ratchet‑state loss** (cleared site data, no backup): all E2EE history in that browser is gone. The conversation continues fine from the next message (a new X3DH handshake fires). Show a one‑time "لا يمكن استعادة الرسائل المشفّرة القديمة على هذا الجهاز" notice.

---

## 8. Trust & verification UX ("beyond WhatsApp" surface)

- **First message in an E2EE conversation** inserts a non‑removable system chip:
  > 🔒 هذه المحادثة مشفّرة من طرف إلى طرف. لا أحد خارجها — ولا نحن — يستطيع قراءة الرسائل. [تحقّق]
- **Safety number**: `SHA‑256(sort(IK_A_pub, IK_B_pub))` → 60 digits, grouped 5×12, shown on a "تحقّق من التشفير" screen, plus a QR of the same. Matching in person = verified; store `verified:true` locally, show a shield on the chat header.
- **Key‑change warning**: on every conversation open, `GET /e2ee/keys/:peer/identity` and compare to the cached `IK_peer`. If changed → a prominent inline warning (`⚠️ تغيّر مفتاح <name> الأمني`), messages still send but the shield drops to unverified until re‑checked. (Matches WhatsApp; the "beyond" part is making it *inline and explained*, not a silent toast.)
- **Per‑message lock**: encrypted bubbles carry a tiny 🔒; a plaintext bubble in an otherwise‑encrypted history (legacy) carries a muted "غير مشفّرة".
- **Per‑conversation state in the list**: a lock glyph on E2EE conversations; the preview line reads `🔒 رسالة` (no content).

---

## 9. Degraded features — explicit handling

| Feature | Plaintext conv | E2EE conv |
|---|---|---|
| Conversation‑list preview | server‑built text | `🔒 رسالة` + time. *(Enhancement: client caches last decrypted line per conv in IndexedDB and renders that locally.)* |
| Push notification body | full text | `📩 رسالة جديدة من <name>` only |
| Server‑side message search (`/chat/.../search`) | works | returns empty; client does a naive filter over locally‑decrypted, loaded messages, with a "نتائج ضمن الرسائل المحمّلة فقط" note |
| Forward to another chat | direct | decrypt locally → re‑encrypt for the target session. v1: allowed only into another E2EE conv; disabled into plaintext with a warning |
| Reactions / edit / delete‑for‑everyone | direct | control messages inside the encrypted envelope (§5) |
| AI features on chat | n/a (chat isn't in AI context today) | n/a |
| Moderation / abuse review of content | possible | **not possible** — only user reports + metadata. Documented policy change. |
| Voice / media | direct URL | encrypted blob + key in envelope (§5) |
| "Starred messages", pin, mentions | server logic on text | client‑side only for E2EE convs |

---

## 10. Rollout

1. **`E2EE_ENABLED`** (backend) + **`NEXT_PUBLIC_E2EE_ENABLED`** (frontend) — both off. Ship the key‑registry backend + client key‑gen behind the flag; nothing user‑visible.
2. Internal dogfood: enable for the 3 test accounts, verify handshake + ratchet + reconnect + offline batch + key rotation.
3. **Opt‑in beta**: a profile toggle "تفعيل التشفير من طرف إلى طرف". A conversation becomes E2EE only when **both** users have opted in and registered. Everything else stays exactly as now.
4. Watch: decrypt‑failure rate (Sentry), skipped‑key overflow, prekey exhaustion, "key changed" frequency.
5. **Default‑on for new 1:1 conversations** once decrypt‑failure rate is ~0 over a sustained window. Existing plaintext history is never re‑encrypted.

## 11. Implementation phases

- **P0** — backend `src/e2ee/` module: `User.e2ee`, `E2eePreKey`, the 5 endpoints, `Conversation.e2ee`, `Message.encrypted/payload`, generic push body for encrypted messages. Flag‑gated, no behaviour change. *(this session)*
- **P1** — `lib/e2ee/`: keygen + IndexedDB store (`keys.ts`, `store.ts`), bundle upload/replenish, `GET /e2ee/status` polling, profile opt‑in toggle. No message crypto yet.
- **P2** — X3DH (`x3dh.ts`) + Double Ratchet (`ratchet.ts`) + envelope (`envelope.ts`), pure functions with unit tests.
- **P3a** — session bridge (`session-core.ts` pure + `session.ts` IndexedDB/API bindings): bootstrap-on-first-message either direction, prekey header until acked, per-conversation promise chain. Verified in `selftest.ts`. *(done)*
- **P3b** — wire into `ChatWindow` / `MessageInput` / `MessageBubble` / `ConversationList` / `ChatProvider`: `chat.ts` seam (`encryptText`/`decryptMessage`), IndexedDB plaintext cache so history survives a reload, `GET /chat/conversations/:id/e2ee`, boot key registration, per-device opt-out, encrypt-on-send / decrypt-on-receive, decrypt-fail + locked-out states, system chip, list lock glyph, `EncryptionSettings` profile card. *(done)*
- **P4** — verification: safety number (`verification.ts`, 60 digits from the sorted identity-key pair), `SafetyNumberModal` opened from the DM info panel, key-change tracking (`verify.ts` + `verify` store) with an inline warning chip in `ChatWindow` and a verified tick in the header. QR scan deferred (no lib) — manual number comparison is the path. *(done)*
- **P5** — *(done)* control messages + media. `Message.control` (+ DTO) marks encrypted reaction/edit/delete carriers: stored & relayed for offline delivery + reload replay, but no preview / notification / unread / bubble. `chat.ts` grows `encryptInner` + `decryptToInner` (returns the raw `InnerEnvelope`; `cacheOnly` for our own outbound, which the ratchet can't decrypt). `apply-encrypted-inner.ts` folds a decrypted inner into the message list (text → cleartext, media → descriptor, reaction/edit/delete → mutate target, author-guarded). Media: `media.ts` `sealBlob`/`fetchAndDecryptBlob` — a fresh AES-256-GCM key per attachment, ciphertext to the CDN, key+IV in the `{k:'media'}` envelope; `MessageInput` seals+uploads, `EncryptedMedia` fetches+decrypts (image/voice inline, file on tap). ~9.5MB cap (no split path for ciphertext). Forward: encrypted text is re-encrypted client-side into each destination; encrypted attachments can't be forwarded (v1). Own control ids cached via the socket emit ack so they replay after reload.
- **P6** — *(done)* passphrase key backup / restore. Identity + signed-prekey keypairs are now generated `extractable`; one-time prekeys stay non-extractable. `backup.ts`: `createBackup(passphrase)` exports the identity (pkcs8) into a `BackupEnvelope` = PBKDF2-SHA-256 (600k iters) → AES-256-GCM; `restoreBackup` reverses it and writes the identity (+ old signed prekey) back into the store. Backend: `User.e2eeBackup {blob,updatedAt}`, `GET/PUT/DELETE /e2ee/backup` (opaque blob), `status.hasBackup`. `register.ts`: `ensureDeviceRegistered` now returns `'ready'|'created'|'needs-restore'|'unavailable'` and **never rotates the identity silently** — if the server says we're registered but this device has no keys it returns `needs-restore`; `forceCreateIdentity` (start fresh) and `republishAfterRestore` (fresh SPK + OPK pool under the restored identity, so new chats work without a safety-number change) round it out. `EncryptionSettings` gains a backup form (server + downloadable file) and a restore panel (from server / file / start-fresh). Sessions + message cache are NOT backed up — a restored device re-handshakes on the next message and starts with empty history.

### P6 known limits
- Restored device: ongoing conversations re-handshake transparently, but decrypted history does not transfer (same as a post-ratchet reload). Session backup would need extractable ratchet DH keys — deferred.
- In-flight X3DH prekey messages aimed at the pre-restore OPK pool are lost (peer re-handshakes on next send).

### P5 known risks / follow-ups
- `EncryptedMedia` does a cross-origin `fetch(cloudinaryUrl)` → needs Cloudinary CORS (`ACAO: *`, which it sends for delivery URLs). Falls back to a "تعذّر فك تشفير المرفق" state. **Verify in a real browser.**
- Control messages persist as full `Message` docs (one per reaction toggle). Fine at this scale; revisit if chats get reaction-heavy.
- Multi-tab of the same account: a tab that didn't send a message can't decrypt it (own outbound, not in that tab's cache) → shows decrypt-failed. Consistent with the v1 single-device scope.

## 12. Open questions

- Rotate `SPK` on a timer in the client, or lazily when `GET /e2ee/status` says it's stale? → lazy, client‑driven.
- OPK batch size / low‑water mark → 100 / replenish under 20.
- `MAX_SKIP` 1000 — enough for a student who's offline for days in a busy group DM? Probably; revisit with data.
- Store ratchet state per message received (durability) vs debounced → debounced write (every N ms or on unload) with a "last known good" fallback.
- Do we encrypt typing indicators / read receipts? v1: no (they're metadata, sent over the socket, not stored).
