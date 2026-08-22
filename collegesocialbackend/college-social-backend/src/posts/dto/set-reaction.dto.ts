import { IsEnum } from 'class-validator';
import { ReactionType } from '../schemas/post.schema';

export class SetReactionDto {
  @IsEnum(ReactionType, { message: 'نوع التفاعل غير صالح' })
  type: ReactionType;
}
