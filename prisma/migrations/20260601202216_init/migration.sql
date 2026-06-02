-- CreateTable
CREATE TABLE `cat_regimen` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `raw` VARCHAR(30) NOT NULL,
    `normalizado` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `cat_regimen_raw_key`(`raw`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_tipo_agenda` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `raw` VARCHAR(50) NOT NULL,
    `normalizado` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `cat_tipo_agenda_raw_key`(`raw`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_tipo_cita` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `raw` VARCHAR(30) NOT NULL,
    `normalizado` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `cat_tipo_cita_raw_key`(`raw`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_estado_cita` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `raw` VARCHAR(30) NOT NULL,
    `estado_autorizacion` VARCHAR(30) NOT NULL,
    `estado_consulta` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `cat_estado_cita_raw_key`(`raw`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_sede` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `raw` VARCHAR(100) NOT NULL,
    `normalizado` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `cat_sede_raw_key`(`raw`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_convenio` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `nombre_convenio` VARCHAR(200) NOT NULL,
    `tipo_servicio` VARCHAR(20) NULL,
    `nombre_mpio` VARCHAR(50) NULL,
    `entidad_administradora` VARCHAR(100) NULL,
    `regimen` VARCHAR(20) NULL,

    UNIQUE INDEX `cat_convenio_nombre_convenio_key`(`nombre_convenio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_convenio_sap` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `sede_uo` VARCHAR(100) NOT NULL,
    `cod_aseguradora` VARCHAR(30) NOT NULL,
    `interlocutor_comercial` VARCHAR(100) NOT NULL,
    `nombre_convenio` VARCHAR(200) NULL,
    `tipo_servicio` VARCHAR(20) NULL,
    `regimen` VARCHAR(20) NULL,
    `nombre_sede` VARCHAR(100) NULL,
    `nombre_mpio` VARCHAR(50) NULL,
    `entidad_administradora` VARCHAR(100) NULL,

    UNIQUE INDEX `cat_convenio_sap_sede_uo_cod_aseguradora_interlocutor_comerc_key`(`sede_uo`, `cod_aseguradora`, `interlocutor_comercial`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_cups` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(10) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `homologado` VARCHAR(100) NULL,
    `pym` VARCHAR(100) NULL,
    `grupo` VARCHAR(100) NULL,

    UNIQUE INDEX `cat_cups_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_cups_pana` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `especialidad_cita` VARCHAR(100) NOT NULL,
    `es_control` CHAR(1) NOT NULL,
    `codigo` VARCHAR(10) NOT NULL,
    `homologado` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `cat_cups_pana_especialidad_cita_es_control_key`(`especialidad_cita`, `es_control`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cat_especialidad` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `raw` VARCHAR(100) NOT NULL,
    `esp_ajustada` VARCHAR(100) NULL,
    `grupo_especialidad` VARCHAR(100) NULL,

    UNIQUE INDEX `cat_especialidad_raw_key`(`raw`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raw_plenus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agendacita_id` VARCHAR(30) NULL,
    `fechacita` DATE NULL,
    `horacita` TIME NULL,
    `fechadeseada` DATE NULL,
    `fechaasignacion` DATE NULL,
    `hora_inicio_consulta` TIME NULL,
    `fechaatencion` DATE NULL,
    `oportunidad` VARCHAR(20) NULL,
    `convencion` VARCHAR(5) NULL,
    `identificacion` VARCHAR(30) NULL,
    `nombrecompleto` VARCHAR(255) NULL,
    `sexopaciente` CHAR(1) NULL,
    `fechanacimiento` DATE NULL,
    `edadanios` VARCHAR(10) NULL,
    `programacronico` VARCHAR(100) NULL,
    `direccion` VARCHAR(500) NULL,
    `municipio` VARCHAR(100) NULL,
    `telefonomovil` VARCHAR(30) NULL,
    `telefonofijo` VARCHAR(30) NULL,
    `codigocups` VARCHAR(20) NULL,
    `identificacionmedico` VARCHAR(30) NULL,
    `mediconombre` VARCHAR(255) NULL,
    `medicoespecialidad` VARCHAR(100) NULL,
    `diagnosticoprincipal` VARCHAR(10) NULL,
    `diagnosticorelacionado1` VARCHAR(10) NULL,
    `diagnosticorelacionado2` VARCHAR(10) NULL,
    `diagnosticorelacionado3` VARCHAR(10) NULL,
    `causaexterna_id` VARCHAR(10) NULL,
    `causaexternanombre` VARCHAR(100) NULL,
    `finalidad_id` VARCHAR(10) NULL,
    `finalidad` VARCHAR(100) NULL,
    `tipodiagnostico_id` VARCHAR(10) NULL,
    `tipodiagnosticonombre` VARCHAR(100) NULL,
    `estado_cita` VARCHAR(30) NULL,
    `pym` VARCHAR(255) NULL,
    `modalidad` VARCHAR(50) NULL,
    `estado_consulta` VARCHAR(30) NULL,
    `nota_no_asistencia` TEXT NULL,
    `funcionario_nota_no_asistencia` VARCHAR(255) NULL,
    `funcionarioasignacita` VARCHAR(255) NULL,
    `convenionombre` VARCHAR(300) NULL,
    `funcionalidad` VARCHAR(255) NULL,
    `rotulo` VARCHAR(255) NULL,
    `regimen` VARCHAR(30) NULL,
    `nombreips` VARCHAR(150) NULL,
    `nombresede` VARCHAR(100) NULL,
    `turno_doble` VARCHAR(5) NULL,
    `identificador_agenda` VARCHAR(30) NULL,
    `nombre_estado` VARCHAR(30) NULL,
    `notacita` TEXT NULL,
    `fecha_ingreso_cronico` DATE NULL,
    `tipocita` VARCHAR(30) NULL,
    `remision` VARCHAR(20) NULL,
    `poblacion_vulnerable` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raw_pana` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo_cita` VARCHAR(30) NULL,
    `tipo_documento` VARCHAR(20) NULL,
    `identificacion` VARCHAR(30) NULL,
    `nombre` VARCHAR(255) NULL,
    `sexo` VARCHAR(50) NULL,
    `nivel_usr` VARCHAR(20) NULL,
    `tipo_usuario` VARCHAR(150) NULL,
    `edad` VARCHAR(10) NULL,
    `tel1` VARCHAR(30) NULL,
    `tel2` VARCHAR(30) NULL,
    `codigo_contrato` VARCHAR(30) NULL,
    `nombre_cnt` VARCHAR(255) NULL,
    `plan_cnt` VARCHAR(50) NULL,
    `fecha_cita` DATETIME NULL,
    `consultorio` VARCHAR(20) NULL,
    `turno` TIME NULL,
    `cuota_recuperacion` DECIMAL(18, 2) NULL,
    `cita_mas_proxima` DATETIME NULL,
    `fecha_deseada` DATETIME NULL,
    `estado` VARCHAR(100) NULL,
    `fecha_asig` DATETIME NULL,
    `codigo_sede` VARCHAR(20) NULL,
    `nombre_sede` VARCHAR(100) NULL,
    `codigo_medico` VARCHAR(30) NULL,
    `nombre_medico` VARCHAR(255) NULL,
    `especialidad` VARCHAR(100) NULL,
    `grupo` VARCHAR(100) NULL,
    `procedimiento_especifico` VARCHAR(500) NULL,
    `especialidad_cita` VARCHAR(100) NULL,
    `control` VARCHAR(5) NULL,
    `tipo_agenda` VARCHAR(100) NULL,
    `codigo_usuario_asignacion` VARCHAR(255) NULL,
    `nombre_usuario_asignacion` VARCHAR(255) NULL,
    `fecha_atencion` DATETIME NULL,
    `dx_ppal_atencion` VARCHAR(10) NULL,
    `nombre_dx_ppal_atencion` VARCHAR(500) NULL,
    `cita_doble` VARCHAR(20) NULL,
    `usuario_cumplimiento` VARCHAR(255) NULL,
    `fecha_cumplimiento` DATETIME NULL,
    `proc_agendado` VARCHAR(255) NULL,
    `fecha_atencion_proc` DATETIME NULL,
    `usuario_atencion_proc` VARCHAR(255) NULL,
    `turno_extra` VARCHAR(20) NULL,
    `ctrl_post_qx` VARCHAR(20) NULL,
    `estado_norm` VARCHAR(100) NULL,
    `mes` VARCHAR(50) NULL,
    `tipo_cita` VARCHAR(100) NULL,
    `primvez_odont` VARCHAR(20) NULL,
    `oportunidad` VARCHAR(20) NULL,
    `esp_ajustada` VARCHAR(100) NULL,
    `grupo_especialidad` VARCHAR(100) NULL,
    `sede` VARCHAR(100) NULL,
    `entadministradora` VARCHAR(100) NULL,
    `regimen` VARCHAR(100) NULL,
    `indsolicitud` VARCHAR(20) NULL,
    `inddeseada` VARCHAR(20) NULL,
    `res256` VARCHAR(50) NULL,
    `tipocita256` VARCHAR(50) NULL,
    `res1552` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raw_sap` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sede_uo` VARCHAR(100) NULL,
    `cod_habilitacion` VARCHAR(30) NULL,
    `nit_aseguradora` VARCHAR(30) NULL,
    `numero_autorizacion` VARCHAR(100) NULL,
    `unidad_organizativa` VARCHAR(100) NULL,
    `uo_medica` VARCHAR(100) NULL,
    `clv_espec_medicos` VARCHAR(100) NULL,
    `sede_uo2` VARCHAR(100) NULL,
    `prestacion` VARCHAR(100) NULL,
    `descripcion` VARCHAR(500) NULL,
    `texto_prestacion1` VARCHAR(500) NULL,
    `texto_prestacion2` VARCHAR(500) NULL,
    `texto_prestacion3` VARCHAR(500) NULL,
    `tipo_prestacion` VARCHAR(100) NULL,
    `cod_aseguradora` VARCHAR(100) NULL,
    `interlocutor_comercial` VARCHAR(100) NULL,
    `creado_por` VARCHAR(100) NULL,
    `nombre_usuario_generador` VARCHAR(255) NULL,
    `codigo_usuario_generador` VARCHAR(100) NULL,
    `episodio` VARCHAR(30) NULL,
    `fecha_admision` DATE NULL,
    `uo_medica_admision` VARCHAR(100) NULL,
    `fecha_entrada` DATE NULL,
    `creado_por2` VARCHAR(100) NULL,
    `status_episodio` VARCHAR(255) NULL,
    `indicador_anulacion` VARCHAR(20) NULL,
    `nombre_responsable_anulacion` VARCHAR(255) NULL,
    `fecha_anulacion` DATE NULL,
    `fecha_inicio` DATE NULL,
    `hora_inicio` TIME NULL,
    `fecha_creacion` DATE NULL,
    `fecha_deseada` DATE NULL,
    `fecha_ultima_modif` DATE NULL,
    `movimiento` VARCHAR(20) NULL,
    `status_movimiento` VARCHAR(100) NULL,
    `modificado_por` VARCHAR(100) NULL,
    `numero_persona` VARCHAR(30) NULL,
    `interlocutor_pac` VARCHAR(255) NULL,
    `paciente` VARCHAR(100) NULL,
    `tip_doc_identifica` VARCHAR(20) NULL,
    `num_identificacion` VARCHAR(30) NULL,
    `nombre_completo` VARCHAR(255) NULL,
    `apellido` VARCHAR(100) NULL,
    `apellido_soltero` VARCHAR(100) NULL,
    `primer_nombre` VARCHAR(100) NULL,
    `segundo_nombre` VARCHAR(100) NULL,
    `fecha_nacimiento` DATE NULL,
    `sexo` VARCHAR(50) NULL,
    `estado_civil` VARCHAR(20) NULL,
    `nacionalidad` VARCHAR(20) NULL,
    `poblacion` VARCHAR(100) NULL,
    `distrito` VARCHAR(50) NULL,
    `correo_electronico` VARCHAR(150) NULL,
    `telefono1` VARCHAR(30) NULL,
    `telefono2` VARCHAR(30) NULL,
    `direccion` VARCHAR(500) NULL,
    `cantidad_registros` VARCHAR(20) NULL,
    `duracion_citacion` VARCHAR(20) NULL,
    `edad` VARCHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `costos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fuente` VARCHAR(10) NOT NULL,
    `codigo_origen` VARCHAR(30) NULL,
    `fecha_cita` DATE NOT NULL,
    `hora_cita` TIME NULL,
    `fecha_deseada` DATE NULL,
    `fecha_asig` DATE NULL,
    `tipo_documento` VARCHAR(20) NULL,
    `identificacion` VARCHAR(30) NULL,
    `nombre` VARCHAR(255) NULL,
    `sexo` CHAR(1) NULL,
    `idsoft_medico` VARCHAR(30) NULL,
    `id_medico` VARCHAR(30) NULL,
    `nombre_medico` VARCHAR(255) NULL,
    `especialidad` VARCHAR(500) NULL,
    `pym` VARCHAR(255) NULL,
    `procedimiento_especifico` VARCHAR(500) NULL,
    `grupo` VARCHAR(150) NULL,
    `cie10_dxppal` VARCHAR(20) NULL,
    `tipo_cita` VARCHAR(50) NULL,
    `valor_recuperacion` DECIMAL(18, 2) NULL,
    `costo_servicio` DECIMAL(18, 2) NULL,
    `funcionalidad` VARCHAR(50) NULL,
    `tipo_agenda` VARCHAR(50) NULL,
    `estado_autorizacion` VARCHAR(100) NULL,
    `estado_consulta` VARCHAR(50) NULL,
    `nombre_usuario_asignacion` VARCHAR(255) NULL,
    `proceso_cita` VARCHAR(50) NULL,
    `nombre_convenio` VARCHAR(300) NULL,
    `regimen` VARCHAR(50) NULL,
    `nombre_sede` VARCHAR(150) NULL,
    `cups` VARCHAR(20) NULL,
    `tipo_servicio` VARCHAR(50) NULL,
    `grupo_especialidad` VARCHAR(150) NULL,
    `nombre_mpio` VARCHAR(100) NULL,
    `entidad_administradora` VARCHAR(150) NULL,
    `fecha_carga` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
