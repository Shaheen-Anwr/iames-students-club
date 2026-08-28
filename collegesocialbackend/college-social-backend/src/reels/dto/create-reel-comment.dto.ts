import { IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReelCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'التعليق لا يمكن أن يكون فارغًا' })
  @MaxLength(1000, { message: 'التعليق طويل جدًا' })
  text: string;

  // Set to reply to a top-level comment; omitted for a top-level comment.
  @IsOptional()
  @IsMongoId()
  parent?: string;
}
