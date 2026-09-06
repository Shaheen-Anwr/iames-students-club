import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export class UpsertScheduleBoardDto {
  @IsEnum(Department, { message: 'القسم غير صالح' })
  department: Department;

  @IsEnum(AcademicYear, { message: 'السنة الدراسية غير صالحة' })
  academicYear: AcademicYear;

  @IsEnum(Specialization, { message: 'التخصص غير صالح' })
  specialization: Specialization;

  // URL from POST /api/upload/post-images -- a photo of the whole physical/printed timetable.
  @IsString()
  @IsNotEmpty({ message: 'صورة الجدول مطلوبة' })
  photoUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500, { message: 'الوصف طويل جدًا' })
  description?: string;
}
