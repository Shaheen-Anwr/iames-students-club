import { IsIn, IsISO8601, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { SHAREABLE_CARD_KINDS } from './create-message.dto';

// POST /chat/messages/:id/remind
export class RemindMessageDto {
  @IsISO8601()
  at: string;
}

// POST /chat/conversations/:id/cards -- share a platform item into a chat from anywhere in the
// app (the feed's share sheet, an assignment, an event...), without an open chat socket.
export class ShareCardDto {
  @IsIn(SHAREABLE_CARD_KINDS)
  kind: (typeof SHAREABLE_CARD_KINDS)[number];

  @IsMongoId()
  refId: string;

  // Optional note sent along with the card.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;
}
