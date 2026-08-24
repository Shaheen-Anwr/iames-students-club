import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateLectureFolderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['lecture', 'video'])
  type: 'lecture' | 'video';
}
