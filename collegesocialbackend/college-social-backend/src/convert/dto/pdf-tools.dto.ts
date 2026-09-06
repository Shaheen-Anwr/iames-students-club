import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

// Shared by reorder/rotate/pages/split -- all operate on a PDF already uploaded via
// POST /convert/tools/stage (see ConvertToolsController).
export class StagedRefDto {
  @IsMongoId()
  stagedId: string;
}

export class ReorderDto extends StagedRefDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  order: number[];
}

export class RotateDto extends StagedRefDto {
  // Page index (as a string key) -> delta degrees (+/-90/180/270). Plain JSON body, so this arrives
  // as a real object already -- no multipart string-parsing needed.
  @IsObject()
  rotations: Record<string, number>;
}

export class PagesDto extends StagedRefDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  pages: number[];

  @IsIn(['keep', 'delete'])
  mode: 'keep' | 'delete';
}

export class SplitDto extends StagedRefDto {
  @IsArray()
  @ArrayMinSize(1)
  groups: number[][];
}

// Multipart form field for protect/remove-password.
export class PasswordDto {
  @IsString()
  @MinLength(4, { message: 'كلمة المرور قصيرة جدًا' })
  password: string;
}

export class CompressDto {
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  level?: 'low' | 'medium' | 'high';
}

export class OcrDto {
  @IsOptional()
  @IsIn(['ara', 'eng', 'ara+eng'])
  language?: 'ara' | 'eng' | 'ara+eng';
}

// Multipart form fields arrive as strings -- these three are optional numeric knobs on the
// watermark tool, transformed from string to number since class-validator sees raw multipart body.
export class WatermarkDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(1)
  opacity?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(8)
  @Max(200)
  fontSize?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  rotationDeg?: number;
}
