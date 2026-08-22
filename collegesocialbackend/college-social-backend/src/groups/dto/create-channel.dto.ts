import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم القناة مطلوب' })
  @MaxLength(50)
  name: string;
}
