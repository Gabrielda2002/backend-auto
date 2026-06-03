import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCatTipoCitaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
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
