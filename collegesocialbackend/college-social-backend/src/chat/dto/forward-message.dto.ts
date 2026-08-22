import { ArrayMinSize, IsMongoId } from 'class-validator';

export class ForwardMessageDto {
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  conversationIds: string[];
}
