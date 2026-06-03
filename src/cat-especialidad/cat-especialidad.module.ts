import { Module } from '@nestjs/common';
import { CatEspecialidadController } from './cat-especialidad.controller';
import { CatEspecialidadService } from './cat-especialidad.service';

@Module({
  controllers: [CatEspecialidadController],
  providers: [CatEspecialidadService],
})
export class CatEspecialidadModule {}
