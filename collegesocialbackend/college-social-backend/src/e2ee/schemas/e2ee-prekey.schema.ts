import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type E2eePreKeyDocument = HydratedDocument<E2eePreKey>;

// One-time prekeys (the X3DH "OPK" pool). The client uploads a batch of public keys; the server
// hands out exactly one per session-init request and deletes it (findOneAndDelete). See
// docs/e2ee-design.md §3 / §6.
@Schema({ timestamps: true })
export class E2eePreKey {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  // Client-assigned id, unique per user -- lets the initiator tell the responder which OPK was
  // consumed so they can pick the matching private key.
  @Prop({ type: Number, required: true })
  keyId: number;

  // b64 SPKI ECDH P-256 public key.
  @Prop({ type: String, required: true })
  publicKey: string;
}

export const E2eePreKeySchema = SchemaFactory.createForClass(E2eePreKey);
E2eePreKeySchema.index({ user: 1, keyId: 1 }, { unique: true });
