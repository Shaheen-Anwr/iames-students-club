import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { GroupVisibility } from '../schemas/study-group.schema';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'اسم المجموعة مطلوب' })
  @MaxLength(80)
  name?: string;

  // Empty string clears the description.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: GroupVisibility;
}
