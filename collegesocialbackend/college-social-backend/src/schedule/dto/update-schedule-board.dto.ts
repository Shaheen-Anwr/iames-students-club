import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// PATCH /schedule/board/:id -- replace an existing photo/description in place, and/or flip
// `active` (the show/hide toggle in ScheduleBoardPhoto.tsx, replacing a hard delete). All fields
// optional -- PATCH semantics, omitting a field leaves it unchanged.
export class UpdateScheduleBoardDto {
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500, { message: 'الوصف طويل جدًا' })
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
