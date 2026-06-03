import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCatCupsPanaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  especialidadCita!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  esControl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  homologado!: string;
}
