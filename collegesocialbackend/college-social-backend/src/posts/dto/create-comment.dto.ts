import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'التعليق لا يمكن أن يكون فارغًا' })
  @MaxLength(2000, { message: 'التعليق طويل جدًا' })
  text: string;
}
