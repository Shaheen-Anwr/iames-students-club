import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { GroupVisibility } from '../schemas/study-group.schema';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المجموعة مطلوب' })
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: GroupVisibility;
}
