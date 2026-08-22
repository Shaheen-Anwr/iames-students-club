import { IsEmail, IsIn, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
import { Role, REGISTERABLE_ROLES } from '../../common/enums/role.enum';
import { Department, SELECTABLE_DEPARTMENTS } from '../../common/enums/department.enum';

export class RegisterDto {
  // College-issued ID, e.g. "2430525"
  @IsString()
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'الرقم الجامعي يجب أن يتكون من أحرف وأرقام فقط' })
  collegeId: string;

  @IsString()
  @MinLength(6, { message: 'يجب ألا تقل كلمة المرور عن 6 أحرف' })
  password: string;

  @IsString()
  @MinLength(2, { message: 'يجب ألا يقل الاسم عن حرفين' })
  name: string;

  // The account's only email. Required, and must be verified via an emailed code before
  // collegeEmailVerifiedAt is set (see AuthService.verifyEmail). Exact-format enforcement
  // (must equal `${collegeId}${COLLEGE_EMAIL_DOMAIN}`) happens in UsersService, not here --
  // this DTO can't see collegeId's sibling value in a clean way, and UpdateUserDto needs the
  // same check without collegeId present at all.
  @IsEmail({}, { message: 'البريد الجامعي غير صالح' })
  collegeEmail: string;

  // Note: "admin" is intentionally excluded here — it can't be self-assigned at signup.
  // The first user to ever register is auto-promoted to admin (see UsersService.create).
  @IsIn(REGISTERABLE_ROLES, { message: 'الدور يجب أن يكون "طالب" أو "أستاذ"' })
  role: Role;

  // Required for students and professors (every self-registerable role); admins don't pick one
  // at signup since "admin" itself can't be self-assigned (see above). NOTE: deliberately no
  // @IsOptional() here -- it would short-circuit validation for an undefined value regardless of
  // @ValidateIf, defeating the "required" part entirely.
  @ValidateIf((dto: RegisterDto) => dto.role === Role.STUDENT || dto.role === Role.PROFESSOR)
  @IsIn(SELECTABLE_DEPARTMENTS, { message: 'الرجاء اختيار الشعبة' })
  department?: Department;
}
