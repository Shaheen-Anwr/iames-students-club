import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateLectureFolderDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
