import { join } from 'path';

export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  // CORS is handled by src/common/cors-origin.ts (pattern-matches any *.vercel.app alias for
  // this project), not read from config -- see main.ts/chat.gateway.ts.
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/college-social',
  // Where local (non-S3) uploads live and get served from. On Render this points at the mounted
  // persistent disk (see render.yaml) so files survive redeploys/restarts.
  uploadsDir: process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    // Short-lived on purpose -- refresh-token rotation (see auth/schemas/session.schema.ts)
    // replaces the old single long-lived JWT.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  },
  refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? '30', 10),
  upload: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? '200', 10),
  },
  collegeEmailDomain: process.env.COLLEGE_EMAIL_DOMAIN ?? '',
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? '',
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
  },
});
