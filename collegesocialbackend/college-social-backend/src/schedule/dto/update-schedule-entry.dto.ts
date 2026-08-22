import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateScheduleEntryDto {
  @IsOptional()
  @IsEnum(Department, { message: 'القسم غير صالح' })
  department?: Department;

  @IsOptional()
  @IsEnum(AcademicYear, { message: 'السنة الدراسية غير صالحة' })
  academicYear?: AcademicYear;

  @IsOptional()
  @IsEnum(Specialization, { message: 'التخصص غير صالح' })
  specialization?: Specialization;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'اسم المقرر مطلوب' })
  courseName?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'صيغة وقت البدء غير صحيحة' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'صيغة وقت الانتهاء غير صحيحة' })
  endTime?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
