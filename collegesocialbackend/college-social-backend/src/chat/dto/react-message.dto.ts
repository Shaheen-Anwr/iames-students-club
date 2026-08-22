import { IsString, MinLength } from 'class-validator';

export class ReactMessageDto {
  @IsString()
  @MinLength(1)
  emoji: string;
}
