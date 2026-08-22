import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PostAttachmentType, PostScope } from '../schemas/post.schema';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export class CreatePostDto {
  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsEnum(PostAttachmentType)
  attachmentType?: PostAttachmentType;

  // Comes from the response of POST /api/upload/lecture|video|file
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentOriginalName?: string;

  // Bytes, from the upload response's `size` field.
  @IsOptional()
  @IsInt()
  @Min(0)
  attachmentSize?: number;

  // Only used when attachmentType is 'image' -- URLs from POST /api/upload/post-images.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  courseCode?: string;

  // Defaults applied in PostsService.create() based on the author's department if omitted.
  @IsOptional()
  @IsEnum(PostScope)
  scope?: PostScope;

  // Explicit tags, set only by the lecture/video upload form in components/lectures/, independent
  // of `scope`/the poster's own department. Omitted for a regular feed post -- PostsService.create()
  // falls back to snapshotting the author's own profile department/academicYear/specialization instead.
  @IsOptional()
  @IsEnum(Department)
  department?: Department;

  @IsOptional()
  @IsEnum(AcademicYear)
  academicYear?: AcademicYear;

  @IsOptional()
  @IsEnum(Specialization)
  specialization?: Specialization;
}
