import { IsIn, IsString } from 'class-validator';
import { ALL_TARGETS } from '../formats';

// Body of POST /api/convert -- multipart/form-data with the file in `file` and this alongside it.
// The source format comes from the uploaded filename; `target` is the extension to convert to.
// Whether this specific source -> target pair is actually supported is checked in ConvertService.
export class ConvertDto {
  @IsString()
  @IsIn(ALL_TARGETS, { message: `target must be one of: ${ALL_TARGETS.join(', ')}` })
  target: string;
}
