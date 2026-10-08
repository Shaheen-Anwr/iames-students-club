import { IsIn, IsString, MaxLength } from 'class-validator';

// Body of POST /api/chat/push-action -- a button tapped on a chat notification.
export class PushActionDto {
  @IsString()
  @MaxLength(512)
  token: string;

  @IsIn(['read', 'mute'])
  action: 'read' | 'mute';
}
