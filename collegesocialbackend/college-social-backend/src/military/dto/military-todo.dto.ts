import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMilitaryTodoDto {
  @IsString()
  @IsNotEmpty({ message: 'نص المهمة مطلوب' })
  @MaxLength(300)
  text: string;
}

export class UpdateMilitaryTodoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'نص المهمة مطلوب' })
  @MaxLength(300)
  text?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
