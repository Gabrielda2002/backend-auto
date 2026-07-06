/*
  Warnings:

  - You are about to alter the column `fecha_carga` on the `costos` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `fecha_cita` on the `raw_pana` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `cita_mas_proxima` on the `raw_pana` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `fecha_deseada` on the `raw_pana` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `fecha_asig` on the `raw_pana` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `fecha_atencion` on the `raw_pana` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `fecha_cumplimiento` on the `raw_pana` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - You are about to alter the column `fecha_atencion_proc` on the `raw_pana` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - Made the column `convenio` on table `cat_convenio_agrupador` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `cat_convenio_agrupador` MODIFY `convenio` VARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE `costos` MODIFY `fecha_carga` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `raw_pana` MODIFY `fecha_cita` DATETIME NULL,
    MODIFY `cita_mas_proxima` DATETIME NULL,
    MODIFY `fecha_deseada` DATETIME NULL,
    MODIFY `fecha_asig` DATETIME NULL,
    MODIFY `fecha_atencion` DATETIME NULL,
    MODIFY `fecha_cumplimiento` DATETIME NULL,
    MODIFY `fecha_atencion_proc` DATETIME NULL;

-- CreateTable
CREATE TABLE `notas_tecnicas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `convenio` VARCHAR(200) NULL,
    `cups` VARCHAR(20) NULL,
    `descripcion` VARCHAR(500) NULL,
    `n_eventos_mes` INTEGER NULL,
    `eventos_ano` INTEGER NULL,
    `fu` DECIMAL(18, 8) NULL,
    `costo_medio_evento` DECIMAL(18, 2) NULL,
    `programa` VARCHAR(100) NULL,
    `fecha_de_nt` DATE NULL,
    `centro_de_costo` VARCHAR(150) NULL,
    `unidad_de_costo` VARCHAR(150) NULL,

    INDEX `notas_tecnicas_convenio_idx`(`convenio`),
    INDEX `notas_tecnicas_cups_idx`(`cups`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nt_map` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_convenio` VARCHAR(300) NOT NULL,
    `cups` VARCHAR(20) NOT NULL,
    `meta_mes` INTEGER NULL,
    `costo_medio` DECIMAL(18, 2) NULL,
    `programa` VARCHAR(100) NULL,

    INDEX `ix_cups_conv`(`cups`, `nombre_convenio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ix_costos_fecha_sede` ON `costos`(`fecha_cita`, `nombre_sede`);

-- CreateIndex
CREATE INDEX `ix_costos_conv_tiposer` ON `costos`(`nombre_convenio`, `tipo_servicio`);

-- CreateIndex
CREATE INDEX `ix_costos_cups_fecha` ON `costos`(`cups`, `fecha_cita`);
