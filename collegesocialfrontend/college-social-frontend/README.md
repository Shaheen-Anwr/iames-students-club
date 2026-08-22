# CampusConnect — Frontend (Next.js)

The web client for the college social network: sign-up by college ID, a lecture/file/video
feed, and WhatsApp-style real-time chat. Pairs with the NestJS + MongoDB backend delivered
earlier in this conversation.

## Run it

```bash
npm install
cp .env.local.example .env.local   # point at your running backend
npm run dev                         # http://localhost:3000
```

Requires the backend running (default `http://localhost:3001`) — register a couple of test
accounts to see the feed and chat populated.

## Design direction

Academic navy/blue theme, chosen to read as an "official college platform" rather than a
generic social app: deep navy (`navy-900`/`navy-700`) for chrome — sidebar, auth screen,
primary buttons — a crisp blue accent for links/actions, and warm gold reserved for the
"Professor" role badge so it reads as a distinguishing mark, not just a label. Layout patterns
are deliberately familiar — a Facebook-style single-column card feed, a WhatsApp-style
two-pane chat (conversation list + thread) that collapses to one pane on mobile with a back
button — so the UI needs no explanation for anyone who's used either app, without copying
either one's visual style.

## Structure

```
app/
  layout.tsx               Root layout: fonts, global CSS, Providers
  page.tsx                  "/" — redirects to /feed or /login based on auth state
  globals.css                Tailwind base + slim custom scrollbar utility

  (auth)/
    layout.tsx                Split-screen shell: navy branding panel + form panel
    login/page.tsx
    register/page.tsx

  (app)/
    layout.tsx                 Wraps every authenticated route in AppShell (guards + nav)
    feed/page.tsx               The lecture/file/video sharing feed
    chat/layout.tsx             Two-pane chat shell (conversation list + thread), responsive
    chat/page.tsx                Empty state ("select a conversation")
    chat/[conversationId]/page.tsx
    profile/page.tsx            Own profile, editable
    profile/[id]/page.tsx       Someone else's profile (read-only + "Message" button)

components/
  ui/                 Hand-built primitives: Button, Input, Textarea, Avatar, Card, Badge
                       (RoleBadge — student/professor), Spinner, Modal
  layout/             Sidebar (desktop), MobileNav + MobileTopbar (mobile), AppShell (guard)
  auth/               LoginForm, RegisterForm (with avatar picker + role toggle)
  feed/               CreatePostBox, PostCard, AttachmentPreview, FeedList
  chat/               ChatProvider (shared conversation list + live updates), ConversationList,
                       NewChatModal (user search), ChatWindow, MessageBubble, MessageInput

lib/
  api.ts               fetch wrapper: attaches the JWT, throws ApiError with the backend's
                        validation message, handles multipart uploads
  auth-context.tsx      useAuth() — user, login, register (+ optional photo), logout
  socket-context.tsx    useSocket() — connects Socket.IO to /chat once logged in
  chat-helpers.ts       Conversation title/avatar resolution for 1:1 vs group chats
  types.ts              TS types mirroring the backend's DTOs/schemas
  toast-context.tsx     useToast() — small success/error notifications
  utils.ts              cn(), timeAgo(), assetUrl() (resolves backend-relative upload paths)
```

## How it fits together

**Auth.** The JWT returned by `/auth/login` or `/auth/register` is stored in a cookie
(`lib/api.ts`, 7-day expiry to match the backend default) and attached as `Authorization:
Bearer <token>` on every API call and on the Socket.IO handshake. `AppShell` (used by every
route under the `(app)` group) redirects to `/login` if there's no valid session — that's the
route guard for the whole app, no middleware needed since everything here is a client
component reading the same auth context.

**Registration photo.** The register form lets you pick a photo before submitting; on success
it creates the account, gets the token, and — only if a photo was chosen — immediately calls
`/upload/photo` with it, matching how you described the signup flow (ID, password, name,
email, optional college email, and a photo from your phone).

**Feed.** `CreatePostBox` uploads the attachment first (`/upload/lecture|video|file`, matching
the backend's per-category size/type limits) and then creates the `Post` with the returned
URL — same two-step flow the backend expects. `PostCard` renders the right preview per type: an
inline `<video>` player for videos, a download card for lectures/files.

**Chat.** `ChatProvider` fetches the conversation list once and refreshes it on every incoming
socket message (keeps previews/ordering in sync without hand-rolled merge logic). `ChatWindow`
loads message history over REST on open, then joins the conversation's Socket.IO room and
appends messages as `newMessage` events arrive — so your own sent messages appear the same way
messages from others do, no optimistic-update bookkeeping needed. Typing indicators and file
attachments in chat both go over the same channels the backend already exposes.

**Roles.** `RoleBadge` renders "Student" (blue) or "Professor" (gold) everywhere a user
appears — feed posts, chat headers, search results, profiles — reading straight off
`user.role` from the backend.

## Verified before delivery

- `npx tsc --noEmit` — clean.
- `npx next build` — compiles clean, all 9 routes generate (static where possible, dynamic for
  the `[id]`/`[conversationId]` routes), lint step included in the build passes.
- Bumped `next`/`eslint-config-next` from `14.2.15` to `14.2.35` after `npm install` flagged a
  known security advisory on the former — the patched version was pulled in before this was
  packaged, not left for you to catch.
- `next start` boots the production build and `/`, `/login`, `/register` all return 200 with
  the expected content (confirmed by grepping for page-specific text in the response), and a
  protected route (`/feed`) still returns 200 for its client-rendered shell rather than
  crashing when hit without a session.
- Not verified: end-to-end behavior against a live backend (register → post → chat → profile
  edit) — that needs the NestJS backend actually running with a real MongoDB, which this sandbox
  couldn't reach (see the backend README's note on this). Run both together locally once before
  treating this as done; the two were built against the same DTOs/schemas but haven't been
  exercised as a pair.

## Notes / next steps

- Uploaded file size limits and allowed types are enforced by the backend (`upload/multer.config.ts`)
  — the frontend's file pickers use `accept` attributes as a UI hint only, not real validation.
- The JWT cookie here is set client-side (not httpOnly). Fine for getting this running; for a
  real deployment consider moving auth through a Next.js route handler that sets an httpOnly
  cookie instead, so the token isn't reachable from JS.
- No unread-message counters or push notifications yet — the chat updates live only while a tab
  is open and connected.
