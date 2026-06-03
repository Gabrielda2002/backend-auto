import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCatCupsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  codigo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  homologado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  pym?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  grupo?: string;
}
