import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Department, SELECTABLE_DEPARTMENTS } from '../../common/enums/department.enum';
import { AcademicYear, ACADEMIC_YEARS } from '../../common/enums/academic-year.enum';
import { Specialization, SPECIALIZATIONS } from '../../common/enums/specialization.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'يجب ألا يقل الاسم عن حرفين' })
  name?: string;

  // If changed, UsersService resets verification and sends a new confirmation code. Exact-format
  // enforcement (must equal `${collegeId}${COLLEGE_EMAIL_DOMAIN}`) happens in UsersService.
  @IsOptional()
  @IsEmail({}, { message: 'البريد الجامعي غير صالح' })
  collegeEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'النبذة طويلة جدًا' })
  bio?: string;

  @IsOptional()
  @IsIn(SELECTABLE_DEPARTMENTS, { message: 'الرجاء اختيار شعبة صحيحة' })
  department?: Department;

  @IsOptional()
  @IsIn(ACADEMIC_YEARS, { message: 'الرجاء اختيار سنة دراسية صحيحة' })
  academicYear?: AcademicYear;

  @IsOptional()
  @IsIn(SPECIALIZATIONS, { message: 'الرجاء اختيار تخصص صحيح' })
  specialization?: Specialization;
}
