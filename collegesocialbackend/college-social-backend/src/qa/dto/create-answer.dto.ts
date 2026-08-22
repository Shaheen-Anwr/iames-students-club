import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAnswerDto {
  @IsString()
  @IsNotEmpty({ message: 'الإجابة لا يمكن أن تكون فارغة' })
  body: string;
}
