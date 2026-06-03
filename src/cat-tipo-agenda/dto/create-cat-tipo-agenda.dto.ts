import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCatTipoAgendaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  raw!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  normalizado!: string;
}
