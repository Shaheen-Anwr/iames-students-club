import { IsNotEmpty, IsString } from 'class-validator';

export class JoinGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'رمز الدعوة مطلوب' })
  code: string;
}
