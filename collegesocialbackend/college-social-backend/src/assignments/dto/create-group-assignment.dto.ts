import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AssignmentAttachmentType } from '../schemas/assignment.schema';

export class CreateGroupAssignmentDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الواجب مطلوب' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Unlike the global CreateAssignmentDto, courseCode is optional here -- a study group's shared
  // assignment isn't necessarily tied to an official course code.
  @IsOptional()
  @IsString()
  courseCode?: string;

  @IsDateString({}, { message: 'تاريخ التسليم غير صالح' })
  dueDate: string;

  @IsOptional()
  @IsEnum(AssignmentAttachmentType)
  attachmentType?: AssignmentAttachmentType;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentOriginalName?: string;
}
