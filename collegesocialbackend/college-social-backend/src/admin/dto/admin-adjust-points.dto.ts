import { IsInt } from 'class-validator';

export class AdminAdjustPointsDto {
  @IsInt({ message: 'قيمة النقاط يجب أن تكون رقمًا صحيحًا' })
  delta: number;
}
