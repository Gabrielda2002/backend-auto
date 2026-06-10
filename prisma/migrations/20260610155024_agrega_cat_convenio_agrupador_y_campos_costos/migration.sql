-- AlterTable
ALTER TABLE `costos` ADD COLUMN `convenio_grupo` VARCHAR(50) NULL,
    ADD COLUMN `modalidad` VARCHAR(50) NULL,
    ADD COLUMN `regimen_grupo` VARCHAR(20) NULL,
    ADD COLUMN `sede_grupo` VARCHAR(50) NULL;

-- CreateTable
CREATE TABLE `cat_convenio_agrupador` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `nombre_convenio` VARCHAR(200) NOT NULL,
    `convenio` VARCHAR(20) NULL,
    `sede` VARCHAR(50) NULL,
    `modalidad` VARCHAR(50) NULL,
    `regimen` VARCHAR(20) NULL,

    UNIQUE INDEX `cat_convenio_agrupador_nombre_convenio_key`(`nombre_convenio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
