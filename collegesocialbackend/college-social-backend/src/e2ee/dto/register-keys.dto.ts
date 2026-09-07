import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// b64 SPKI keys are ~120-250 chars for P-256; bound generously to reject junk without being brittle.
const KEY_MIN = 40;
const KEY_MAX = 1000;

export class OneTimePreKeyDto {
  @IsInt()
  keyId: number;

  @IsString()
  @MinLength(KEY_MIN)
  @MaxLength(KEY_MAX)
  publicKey: string;
}

export class SignedPreKeyDto {
  @IsInt()
  id: number;

  @IsString()
  @MinLength(KEY_MIN)
  @MaxLength(KEY_MAX)
  key: string;

  @IsString()
  @MinLength(40)
  @MaxLength(KEY_MAX)
  sig: string;
}

export class RegisterKeysDto {
  @IsString()
  @MinLength(KEY_MIN)
  @MaxLength(KEY_MAX)
  identityKey: string;

  @IsString()
  @MinLength(KEY_MIN)
  @MaxLength(KEY_MAX)
  identitySig: string;

  @ValidateNested()
  @Type(() => SignedPreKeyDto)
  signedPreKey: SignedPreKeyDto;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OneTimePreKeyDto)
  oneTimePreKeys: OneTimePreKeyDto[];
}

export class AddPreKeysDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OneTimePreKeyDto)
  oneTimePreKeys: OneTimePreKeyDto[];
}
