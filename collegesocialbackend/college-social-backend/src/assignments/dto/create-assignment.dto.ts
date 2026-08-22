import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AssignmentAttachmentType } from '../schemas/assignment.schema';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الواجب مطلوب' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty({ message: 'رمز المقرر مطلوب' })
  courseCode: string;

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
