import { ArrayMinSize, IsMongoId } from 'class-validator';

export class AddMembersDto {
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  userIds: string[];
}
