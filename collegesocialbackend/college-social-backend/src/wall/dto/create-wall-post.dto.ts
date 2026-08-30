import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateWallPostDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'المنشور فارغ' })
  @MaxLength(600, { message: 'الحد الأقصى 600 حرفًا' })
  body: string;
}
