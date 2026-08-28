import { join } from 'path';

export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  // CORS is handled by src/common/cors-origin.ts (pattern-matches any *.vercel.app alias for
  // this project), not read from config -- see main.ts/chat.gateway.ts.
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/college-social',
  // Optional. When set, Socket.IO uses the Redis adapter so the chat gateway can run across
  // multiple backend instances (horizontal scale under load). Left blank -> single-instance
  // in-memory adapter, which is the default and works fine for one process. See
  // src/common/redis-io.adapter.ts and main.ts.
  redisUrl: process.env.REDIS_URL ?? '',
  // Where local (non-Cloudinary) uploads live and get served from. On Render this points at the mounted
  // persistent disk (see render.yaml) so files survive redeploys/restarts.
  uploadsDir: process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    // Short-lived on purpose -- refresh-token rotation (see auth/schemas/session.schema.ts)
    // replaces the old single long-lived JWT.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  },
  refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? '30', 10),
  // Per-category upload size limits (MAX_VIDEO_SIZE_MB, MAX_LECTURE_SIZE_MB, etc.) are read
  // directly from process.env in src/upload/multer.config.ts, not here -- Nest evaluates
  // @UseInterceptors(FileInterceptor(...)) decorator arguments before DI/ConfigService exist.
  collegeEmailDomain: process.env.COLLEGE_EMAIL_DOMAIN ?? '',
  // Plain SMTP for verification/reset emails -- works with any provider, no code changes to
  // switch. See EmailService and .env.example for why (Brevo's free tier is the recommended one).
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? '',
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'https://iames-students-club-roan.vercel.app',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
  // Defaults to Groq's free, OpenAI-compatible API (https://console.groq.com -- no credit card
  // needed) so the AI assistant works out of the box on a free tier. Any OpenAI-compatible
  // provider works by overriding AI_BASE_URL/AI_MODEL -- see AiService.
  ai: {
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1',
    model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b',
    // Optional: a separate vision-capable model for image attachments (the default text model
    // above may not support image input). Left blank, the assistant tells the student vision
    // isn't configured yet instead of silently sending an image to a model that can't read it.
    visionModel: process.env.AI_VISION_MODEL ?? '',
    // Max user messages a single student can send to the AI assistant per calendar day, across all
    // their conversations -- protects the provider quota/bill from a single runaway user. See
    // AiConversationsService.sendMessageStream.
    dailyMessageQuota: parseInt(process.env.AI_DAILY_MESSAGE_QUOTA ?? '40', 10),
  },
  // Web Push (VAPID). Generate a pair with `npx web-push generate-vapid-keys`. Until both keys
  // are set, PushService no-ops (logs a warning once) instead of throwing -- see PushService.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  },
  // Shared secret for the unauthenticated release-broadcast endpoint (POST /api/broadcast/release),
  // called by the repo's post-commit git hook to push "a new update shipped" to every subscribed
  // user. Left blank -> the endpoint returns 503 (feature off). Generate any long random string.
  broadcast: {
    apiKey: process.env.BROADCAST_API_KEY ?? '',
  },
});
