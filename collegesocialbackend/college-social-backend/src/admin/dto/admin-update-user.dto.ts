import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsEnum(Role, { message: 'الدور يجب أن يكون "طالب" أو "أستاذ" أو "مدير"' })
  role?: Role;

  @IsOptional()
  @IsBoolean({ message: 'قيمة الحالة غير صالحة' })
  isActive?: boolean;
}
