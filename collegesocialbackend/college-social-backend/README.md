# College Social — Backend (NestJS + MongoDB)

Backend for a college-only social network: login by college ID, a lecture/file/video feed,
and real-time chat. Built to sit behind a Next.js frontend.

## Run it

```bash
npm install
cp .env.example .env      # then edit MONGODB_URI / JWT_SECRET
npm run start:dev         # http://localhost:3001/api
```

Requires a running MongoDB instance (local `mongod`, Docker, or Atlas) — set `MONGODB_URI` in `.env`.

## Structure

```
src/
  main.ts                 Bootstrap: global ValidationPipe, exception filter, CORS, /api prefix
  app.module.ts            Wires Mongoose, static file serving, and all feature modules

  config/
    configuration.ts       Typed env config (port, mongo uri, jwt secret, upload limits)

  common/
    enums/role.enum.ts      Role.STUDENT | Role.PROFESSOR
    decorators/
      roles.decorator.ts    @Roles(Role.PROFESSOR) route metadata
      current-user.decorator.ts  @CurrentUser() -> decoded JWT payload
    guards/roles.guard.ts   Enforces @Roles() against the logged-in user
    filters/http-exception.filter.ts  Uniform JSON error shape

  auth/                     Register/login by collegeId + password
    dto/register.dto.ts     collegeId, password, name, email, collegeEmail?, role
    dto/login.dto.ts
    strategies/jwt.strategy.ts
    guards/jwt-auth.guard.ts
    auth.service.ts          bcrypt hashing + JWT issuing
    auth.controller.ts       POST /api/auth/register, POST /api/auth/login

  users/
    schemas/user.schema.ts   collegeId, passwordHash, name, email, collegeEmail, photoUrl, role
    users.service.ts
    users.controller.ts      GET/PATCH /api/users/me, GET /api/users/search, GET /api/users/:id

  upload/                    Local-disk file uploads (Multer), one route per media type
    multer.config.ts         Per-category storage + mime/size validation
    upload.controller.ts     POST /api/upload/photo|lecture|video|file
    (served back out at GET /uploads/<category>/<file>, wired in app.module.ts)

  posts/                     The lecture/file/video sharing feed
    schemas/post.schema.ts   author, caption, attachmentType, attachmentUrl, courseCode, likes
    posts.service.ts
    posts.controller.ts      POST/GET /api/posts, POST /api/posts/:id/like, DELETE /api/posts/:id

  chat/                      Direct + group messaging
    schemas/conversation.schema.ts
    schemas/message.schema.ts
    chat.service.ts
    chat.controller.ts       GET/POST /api/chat/conversations, GET /api/chat/conversations/:id/messages
    chat.gateway.ts           Socket.IO gateway at /chat, JWT-authenticated handshake,
                               events: joinConversation, sendMessage, typing -> newMessage, userTyping
```

## How the pieces fit together

**Registration/login.** `POST /api/auth/register` takes `collegeId`, `password`, `name`, `email`,
optional `collegeEmail`, and `role` (`student` or `professor`). The password is hashed with bcrypt
before it's stored — nothing plaintext ever touches the database. `POST /api/auth/login` takes
`collegeId` + `password` and returns a JWT (`accessToken`) the frontend attaches as
`Authorization: Bearer <token>` on every subsequent request, and as `{ auth: { token } }` on the
Socket.IO handshake for chat.

**Profile photo.** Uploaded via `POST /api/upload/photo` (multipart, field name `file`) — this both
stores the file under `uploads/photos/` and updates the caller's `photoUrl` in one call. Files are
served back at `/uploads/photos/<filename>`.

**Lectures/files/videos.** Upload the file first (`/api/upload/lecture`, `/api/upload/video`, or
`/api/upload/file`, each with its own mime-type allowlist and size limit), then create a `Post` with
the returned `url` as `attachmentUrl`. This two-step flow keeps the upload and the "post" concept
decoupled — you could attach the same uploaded file to a post later, or skip posting entirely.

**Chat.** REST (`/api/chat/conversations`) is for listing conversations and loading message history
on page load; the Socket.IO gateway (`/chat` namespace) is for everything real-time. On connect, the
gateway verifies the JWT from the handshake and auto-joins the socket to a room per conversation the
user is in, so `sendMessage` events broadcast to everyone in that conversation instantly.

**Roles.** `Role.STUDENT` / `Role.PROFESSOR` live on the `User` schema. Use `@Roles(Role.PROFESSOR)`
plus `RolesGuard` on any controller method you want to restrict (e.g. a future "only professors can
post to this course" endpoint) — see `common/guards/roles.guard.ts`.

## Verified before delivery

- `npx tsc --noEmit` — clean.
- `npx nest build` — clean, full `dist/` output.
- Booted the actual compiled app end-to-end via `NestFactory.create`: this caught and fixed 3 real
  bugs where Mongoose's decorator-based type reflection can't infer `string | null` or enum-typed
  `@Prop()` fields (`User.collegeEmail`, `User.photoUrl`, `User.role`, `Post.attachmentType`, etc.) —
  each now has an explicit `type:` in its `@Prop()` options. Also confirmed `JwtAuthGuard` correctly
  rejects unauthenticated requests (401) and the global `ValidationPipe` correctly rejects invalid
  payloads (400).
- Not verified: live query behavior against a real MongoDB (this sandbox has no network path to
  download or install one) — run `npm run start:dev` against your own MongoDB and exercise the
  register → login → post → chat flow once before treating it as production-ready.

## Suggested next steps for the Next.js frontend

- Store the JWT (e.g. in an httpOnly cookie set by a Next.js API route, or in memory + refresh flow).
- Socket.IO client: `io('http://localhost:3001/chat', { auth: { token } })`.
- For the college-only constraint, either check `collegeEmail` against `COLLEGE_EMAIL_DOMAIN` in
  `auth.service.ts` at registration time, or simply rely on `collegeId` being provisioned/verified
  out-of-band by the school.
