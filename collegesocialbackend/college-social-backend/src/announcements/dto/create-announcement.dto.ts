import { IsBoolean, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Department, SELECTABLE_DEPARTMENTS } from '../../common/enums/department.enum';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الإعلان مطلوب' })
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'نص الإعلان مطلوب' })
  body: string;

  // Omitted -> defaults to the author's own department in AnnouncementsService.create() (null
  // for an author without one, e.g. admin, which makes it platform-wide).
  @IsOptional()
  @IsIn(SELECTABLE_DEPARTMENTS, { message: 'الرجاء اختيار شعبة صحيحة' })
  department?: Department;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsISO8601()
  eventDate?: string;
}
