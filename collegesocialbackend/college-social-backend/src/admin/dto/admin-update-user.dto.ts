import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsEnum(Role, { message: 'الدور يجب أن يكون "طالب" أو "أستاذ" أو "مدير"' })
  role?: Role;

  @IsOptional()
  @IsBoolean({ message: 'قيمة الحالة غير صالحة' })
  isActive?: boolean;

  // Grant / revoke the super-admin flag. Only a super admin can send this (SuperAdminGuard), and
  // AdminService guards against revoking your own flag or removing the last super admin.
  @IsOptional()
  @IsBoolean({ message: 'قيمة صلاحية المدير العام غير صالحة' })
  isSuperAdmin?: boolean;
}
