import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCatSedeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  raw!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  normalizado!: string;
}
