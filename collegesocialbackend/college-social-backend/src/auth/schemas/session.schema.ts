import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

// One row per issued refresh token. `refreshTokenHash` is sha256(secret-half of the opaque
// refresh token) -- the raw token is never stored. The document's own _id doubles as the
// "sessionId" half embedded in the opaque token, so a session row can always be found even
// when the secret half has already been rotated out (which is how reuse/theft is detected).
@Schema({ timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  refreshTokenHash: string;

  @Prop({ type: String, default: null })
  userAgent: string | null;

  @Prop({ type: String, default: null })
  ip: string | null;

  @Prop({ required: true })
  lastUsedAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
// TTL index: MongoDB automatically deletes the document once expiresAt is in the past.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
