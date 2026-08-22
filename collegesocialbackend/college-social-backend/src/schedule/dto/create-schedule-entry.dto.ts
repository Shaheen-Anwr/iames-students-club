import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateScheduleEntryDto {
  @IsEnum(Department, { message: 'القسم غير صالح' })
  department: Department;

  @IsEnum(AcademicYear, { message: 'السنة الدراسية غير صالحة' })
  academicYear: AcademicYear;

  @IsEnum(Specialization, { message: 'التخصص غير صالح' })
  specialization: Specialization;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsString()
  @IsNotEmpty({ message: 'اسم المقرر مطلوب' })
  courseName: string;

  @Matches(TIME_PATTERN, { message: 'صيغة وقت البدء غير صحيحة' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'صيغة وقت الانتهاء غير صحيحة' })
  endTime: string;

  @IsOptional()
  @IsString()
  location?: string;
}
