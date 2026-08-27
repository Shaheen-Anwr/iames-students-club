import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertMilitaryPeriodDto {
  @IsDateString({}, { message: 'تاريخ البداية غير صالح' })
  startDate: string;

  @IsDateString({}, { message: 'تاريخ النهاية غير صالح' })
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  motivationalQuotes?: string[];
}
