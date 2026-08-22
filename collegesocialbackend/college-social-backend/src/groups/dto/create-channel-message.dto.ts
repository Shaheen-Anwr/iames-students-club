import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateChannelMessageDto {
  @IsMongoId()
  channelId: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
