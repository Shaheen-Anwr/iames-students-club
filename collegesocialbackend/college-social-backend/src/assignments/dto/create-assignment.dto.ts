import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { AssignmentAttachmentType } from '../schemas/assignment.schema';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الواجب مطلوب' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Optional for التربية العسكرية assignments -- the service defaults it. Still required for
  // every normal assignment.
  @ValidateIf((o) => !o.isMilitary)
  @IsString()
  @IsNotEmpty({ message: 'رمز المقرر مطلوب' })
  courseCode: string;

  @IsOptional()
  @IsBoolean()
  isMilitary?: boolean;

  @IsDateString({}, { message: 'تاريخ التسليم غير صالح' })
  dueDate: string;

  @IsOptional()
  @IsEnum(AssignmentAttachmentType)
  attachmentType?: AssignmentAttachmentType;

  // Comes from the response of POST /api/upload/lecture|video|file
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentOriginalName?: string;
}
