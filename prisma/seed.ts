import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as fs from 'fs';
import * as path from 'path';

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'citas_db',
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

function parseCsv(filePath: string, separator: string = ';'): string[][] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .trim()
    .split('\n')
    .map((line) => line.split(separator).map((cell) => cell.trim()));
}

async function main() {
  console.log('Seeding catalogos...\n');

  // ── cat_regimen ──
  for (const item of [
    { raw: 'Contributivo', normalizado: 'CONTRIBUTIVO' },
    { raw: 'Subsidiado', normalizado: 'SUBSIDIADO' },
    { raw: 'Vinculado', normalizado: 'CONTRIBUTIVO' },
    { raw: 'Especial', normalizado: 'CONTRIBUTIVO' },
    { raw: 'Otro', normalizado: 'CONTRIBUTIVO' },
    { raw: 'Evento', normalizado: 'CONTRIBUTIVO' },
    { raw: 'Particular', normalizado: 'PARTICULAR' },
  ]) {
    await prisma.catRegimen.upsert({
      where: { raw: item.raw },
      update: { normalizado: item.normalizado },
      create: item,
    });
  }
  console.log(`cat_regimen: ${await prisma.catRegimen.count()} registros`);

  // ── cat_tipo_agenda ──
  for (const item of [
    { raw: 'INTRAMURAL', normalizado: 'PRESENCIAL' },
    { raw: 'TELEMEDICINA INTERACTIVA', normalizado: 'TELEMEDICINA' },
    { raw: 'PRESENCIAL', normalizado: 'PRESENCIAL' },
    { raw: 'TELESALUD', normalizado: 'TELESALUD' },
    { raw: 'TELEMEDICINA - TELEXPERTICIA', normalizado: 'TELEMEDICINA' },
  ]) {
    await prisma.catTipoAgenda.upsert({
      where: { raw: item.raw },
      update: { normalizado: item.normalizado },
      create: item,
    });
  }
  console.log(`cat_tipo_agenda: ${await prisma.catTipoAgenda.count()} registros`);

  // ── cat_tipo_cita ──
  for (const item of [
    { raw: 'Control', normalizado: 'CONTROL' },
    { raw: 'Primer vez', normalizado: 'PRIMERA VEZ' },
    { raw: 'Prioritaria', normalizado: 'PRIMERA VEZ' },
  ]) {
    await prisma.catTipoCita.upsert({
      where: { raw: item.raw },
      update: { normalizado: item.normalizado },
      create: item,
    });
  }
  console.log(`cat_tipo_cita: ${await prisma.catTipoCita.count()} registros`);

  // ── cat_estado_cita ──
  for (const item of [
    { raw: 'ACTIVO', estadoAutorizacion: 'AUTORIZADO', estadoConsulta: 'CUMPLIDA' },
    { raw: 'INCUMPLIDO', estadoAutorizacion: 'CITA INCUMPLIDA', estadoConsulta: 'INCUMPLIDA' },
    { raw: 'CITA CANCELADA', estadoAutorizacion: 'CITA CANCELADA', estadoConsulta: 'CANCELADA' },
    { raw: 'INCUMPLIDA PAGADA', estadoAutorizacion: 'CITA INCUMPLIDA', estadoConsulta: 'INCUMPLIDA' },
    { raw: '#', estadoAutorizacion: 'INCUMPLIDA', estadoConsulta: 'INCUMPLIDA' },
    { raw: 'PLAN', estadoAutorizacion: 'CUMPLIDA', estadoConsulta: 'CUMPLIDA' },
  ]) {
    await prisma.catEstadoCita.upsert({
      where: { raw: item.raw },
      update: {
        estadoAutorizacion: item.estadoAutorizacion,
        estadoConsulta: item.estadoConsulta,
      },
      create: item,
    });
  }
  console.log(`cat_estado_cita: ${await prisma.catEstadoCita.count()} registros`);

  // ── cat_sede ──
  for (const item of [
    { raw: 'NORDVITAL IPS - SEDE CAJICA', normalizado: 'NORDVITAL IPS - SEDE CAJICA' },
    { raw: 'NORDVITAL IPS - SEDE LA MESA', normalizado: 'NORDVITAL IPS - SEDE LA MESA' },
    { raw: 'NORDVITAL IPS - SEDE UBATE', normalizado: 'NORDVITAL IPS - SEDE UBATE' },
    { raw: 'NORDVITAL IPS - SEDE LA CALERA', normalizado: 'NORDVITAL IPS - SEDE LA CALERA' },
    { raw: 'NORDVITAL IPS - SEDE 6', normalizado: 'NORDVITAL IPS - SEDE 06' },
    { raw: 'NORDVITAL IPS - SEDE 5', normalizado: 'NORDVITAL IPS - SEDE 05' },
    { raw: 'NORDVITAL IPS - TORRE SEDE 7', normalizado: 'NORDVITAL IPS - SEDE 07' },
    { raw: 'NORDVITAL IPS - SEDE 3', normalizado: 'NORDVITAL IPS - SEDE 03' },
    { raw: 'NORDVITAL IPS - SEDE 4', normalizado: 'NORDVITAL IPS - SEDE 04' },
    { raw: 'NORDVITAL IPS - SEDE 1', normalizado: 'NORDVITAL IPS - SEDE 01' },
    { raw: 'NORDVITAL IPS SEDE CHIA', normalizado: 'NORDVITAL IPS - SEDE CHIA' },
  ]) {
    await prisma.catSede.upsert({
      where: { raw: item.raw },
      update: { normalizado: item.normalizado },
      create: item,
    });
  }
  console.log(`cat_sede: ${await prisma.catSede.count()} registros`);

  // ── cat_convenio ──
  for (const item of [
    { nombreConvenio: 'ALIVIA PLAN PREMIUM - NORTE SANTANDER', tipoServicio: 'PARTICULAR', nombreMpio: 'CUCUTA', entidadAdministradora: 'ALIVIA', regimen: 'PARTICULAR' },
    { nombreConvenio: 'ALIVIA PLAN STANDART - NORTE SANTANDER', tipoServicio: 'PARTICULAR', nombreMpio: 'CUCUTA', entidadAdministradora: 'ALIVIA', regimen: 'PARTICULAR' },
    { nombreConvenio: 'COMPENSAR CAJICA PGP CONTRIBUTIVO', tipoServicio: 'PGP', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR CAJICA PGP SUBSIDIADO', tipoServicio: 'PGP', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'COMPENSAR CUCUTA EVENTO CONTRIBUTIVO', tipoServicio: 'EVENTO', nombreMpio: 'CUCUTA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR CUCUTA PLAN COMPLEMENTARIO CONTRIBUTIVO EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'CUCUTA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR LA CALERA PGP CONTRIBUTIVO', tipoServicio: 'PGP', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR LA CALERA PGP SUBSIDIADO', tipoServicio: 'PGP', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'COMPENSAR LA CALERA PLAN COMPLEMENTARIO CONTRIBUTIVO EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR LA MESA EVENTO CONTRIBUTIVO', tipoServicio: 'EVENTO', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR LA MESA EVENTO SUBSIDIADO', tipoServicio: 'EVENTO', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'COMPENSAR LA MESA PGP CONTRIBUTIVO', tipoServicio: 'PGP', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR LA MESA PGP SUBSIDIADO', tipoServicio: 'PGP', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'COMPENSAR LA MESA PLAN COMPLEMENTARIO CONTRIBUTIVO EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR UBATE EVENTO CONTRIBUTIVO', tipoServicio: 'EVENTO', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR UBATE EVENTO SUBSIDIADO', tipoServicio: 'EVENTO', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'COMPENSAR UBATE PGP CONTRIBUTIVO', tipoServicio: 'PGP', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COMPENSAR UBATE PGP SUBSIDIADO', tipoServicio: 'PGP', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'COMPENSAR UBATE PLAN COMPLEMENTARIO CONTRIBUTIVO EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COOSALUD CAPITA CONTRIBUTIVO', tipoServicio: 'CAPITA', nombreMpio: 'CUCUTA', entidadAdministradora: 'COOSALUD EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COOSALUD CAPITA PYMS CONTRIBUTIVO', tipoServicio: 'CAPITA', nombreMpio: 'CUCUTA', entidadAdministradora: 'COOSALUD EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COOSALUD CAPITA PYMS SUBSIDIADO', tipoServicio: 'CAPITA', nombreMpio: 'CUCUTA', entidadAdministradora: 'COOSALUD EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'COOSALUD CAPITA SUBSIDIADO', tipoServicio: 'CAPITA', nombreMpio: 'CUCUTA', entidadAdministradora: 'COOSALUD EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'COOSALUD EVENTO SUBSIDIADO', tipoServicio: 'EVENTO', nombreMpio: 'CUCUTA', entidadAdministradora: 'COOSALUD EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'EMCOSALUD LA MESA EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'LA MESA', entidadAdministradora: 'EMCOSALUD EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'FAMISANAR CAJICA CAPITA CONTRIBUTIVO', tipoServicio: 'CAPITA', nombreMpio: 'CAJICA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'FAMISANAR CAJICA CAPITA SUBSIDIADO', tipoServicio: 'CAPITA', nombreMpio: 'CAJICA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'FAMISANAR CAJICA EVENTO CONTRIBUTIVO', tipoServicio: 'EVENTO', nombreMpio: 'CAJICA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'FAMISANAR CAJICA EVENTO SUBSIDIADO', tipoServicio: 'EVENTO', nombreMpio: 'CAJICA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'FAMISANAR CHIA CAPITA CONTRIBUTIVO', tipoServicio: 'CAPITA', nombreMpio: 'CHIA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'FAMISANAR CHIA CAPITA SUBSIDIADO', tipoServicio: 'CAPITA', nombreMpio: 'CHIA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'FAMISANAR CHIA EVENTO CONTRIBUTIVO', tipoServicio: 'EVENTO', nombreMpio: 'CHIA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'FAMISANAR CHIA EVENTO SUBSIDIADO', tipoServicio: 'EVENTO', nombreMpio: 'CHIA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'FAMISANAR CUCUTA SUBSIDIADO EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'CUCUTA', entidadAdministradora: 'FAMISANAR EPS', regimen: 'SUBSIDIADO' },
    { nombreConvenio: 'NUEVA EPS PGP CONTRIBUTIVO', tipoServicio: 'PGP', nombreMpio: 'CUCUTA', entidadAdministradora: 'NUEVA EPS EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'PARTICULAR CAJICA', tipoServicio: 'PARTICULAR', nombreMpio: 'CAJICA', entidadAdministradora: 'PARTICULAR', regimen: 'PARTICULAR' },
    { nombreConvenio: 'PARTICULAR CHIA', tipoServicio: 'PARTICULAR', nombreMpio: 'CHIA', entidadAdministradora: 'PARTICULAR', regimen: 'PARTICULAR' },
    { nombreConvenio: 'PARTICULAR CUCUTA', tipoServicio: 'PARTICULAR', nombreMpio: 'CUCUTA', entidadAdministradora: 'PARTICULAR', regimen: 'PARTICULAR' },
    { nombreConvenio: 'PARTICULAR LA CALERA', tipoServicio: 'PARTICULAR', nombreMpio: 'LA CALERA', entidadAdministradora: 'PARTICULAR', regimen: 'PARTICULAR' },
    { nombreConvenio: 'PARTICULAR LA MESA', tipoServicio: 'PARTICULAR', nombreMpio: 'LA MESA', entidadAdministradora: 'PARTICULAR', regimen: 'PARTICULAR' },
    { nombreConvenio: 'PARTICULAR UBATE', tipoServicio: 'PARTICULAR', nombreMpio: 'UBATE', entidadAdministradora: 'PARTICULAR', regimen: 'PARTICULAR' },
    { nombreConvenio: 'SALUD TOTAL CONTRIBUTIVO EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'CUCUTA', entidadAdministradora: 'SALUD TOTAL EPS', regimen: 'CONTRIBUTIVO' },
    { nombreConvenio: 'SUMIMEDICAL FERROCARRILES EVENTO', tipoServicio: 'EVENTO', nombreMpio: 'CUCUTA', entidadAdministradora: 'FERROCARRILES', regimen: 'ESPECIAL' },
  ]) {
    await prisma.catConvenio.upsert({
      where: { nombreConvenio: item.nombreConvenio },
      update: item,
      create: item,
    });
  }
  console.log(`cat_convenio: ${await prisma.catConvenio.count()} registros`);

  // ── cat_convenio_sap ──
  for (const item of [
    { sedeUo: 'CAJICA NORDVITAL', codAseguradora: 'COMP POS RS', interlocutorComercial: 'COMPENSAR REGIMEN SUBSIDIADO-RS', nombreConvenio: 'COMPENSAR CAJICA PGP SUBSIDIADO', tipoServicio: 'PGP', regimen: 'SUBSIDIADO', nombreSede: 'NORDVITAL IPS - SEDE CAJICA', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'CAJICA NORDVITAL', codAseguradora: 'COMP POS PC', interlocutorComercial: 'COMPENSAR -PC', nombreConvenio: 'COMPENSAR CAJICA PGP CONTRIBUTIVO', tipoServicio: 'PGP', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE CAJICA', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'USS CALERA NORDVITAL', codAseguradora: 'COMP POS PC', interlocutorComercial: 'COMPENSAR -PC', nombreConvenio: 'COMPENSAR LA CALERA PGP CONTRIBUTIVO', tipoServicio: 'PGP', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA CALERA', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'LA MESA NORDVITAL', codAseguradora: 'COMP POS PC', interlocutorComercial: 'COMPENSAR -PC', nombreConvenio: 'COMPENSAR LA MESA PGP CONTRIBUTIVO', tipoServicio: 'PGP', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA MESA', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'USS CALERA NORDVITAL', codAseguradora: 'COMP POS RS', interlocutorComercial: 'COMPENSAR REGIMEN SUBSIDIADO-RS', nombreConvenio: 'COMPENSAR LA CALERA PGP SUBSIDIADO', tipoServicio: 'PGP', regimen: 'SUBSIDIADO', nombreSede: 'NORDVITAL IPS - SEDE LA CALERA', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'UBATE NORDVITAL', codAseguradora: 'COMP POS PC', interlocutorComercial: 'COMPENSAR -PC', nombreConvenio: 'COMPENSAR UBATE PGP CONTRIBUTIVO', tipoServicio: 'PGP', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE UBATE', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'LA MESA NORDVITAL', codAseguradora: 'COMP POS RS', interlocutorComercial: 'COMPENSAR REGIMEN SUBSIDIADO-RS', nombreConvenio: 'COMPENSAR LA MESA PGP SUBSIDIADO', tipoServicio: 'PGP', regimen: 'SUBSIDIADO', nombreSede: 'NORDVITAL IPS - SEDE LA MESA', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'USS CALERA NORDVITAL', codAseguradora: 'COMPLEMT CE', interlocutorComercial: 'COMPENSAR COMPLEMENTARIO-CE', nombreConvenio: 'COMPENSAR LA CALERA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA CALERA', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'CAJICA NORDVITAL', codAseguradora: 'Sin asignar', interlocutorComercial: 'Sin asignar', nombreConvenio: 'COMPENSAR CAJICA PGP CONTRIBUTIVO', tipoServicio: 'PGP', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE CAJICA', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'UBATE NORDVITAL', codAseguradora: 'COMP POS RS', interlocutorComercial: 'COMPENSAR REGIMEN SUBSIDIADO-RS', nombreConvenio: 'COMPENSAR UBATE PGP SUBSIDIADO', tipoServicio: 'PGP', regimen: 'SUBSIDIADO', nombreSede: 'NORDVITAL IPS - SEDE UBATE', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'UBATE NORDVITAL', codAseguradora: 'Sin asignar', interlocutorComercial: 'Sin asignar', nombreConvenio: 'COMPENSAR UBATE PGP CONTRIBUTIVO', tipoServicio: 'PGP', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE UBATE', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'UBATE NORDVITAL', codAseguradora: 'COMPLEMT CE', interlocutorComercial: 'COMPENSAR COMPLEMENTARIO-CE', nombreConvenio: 'COMPENSAR UBATE PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE UBATE', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'CAJICA NORDVITAL', codAseguradora: 'COMPLEMEN CM', interlocutorComercial: 'COMPLEMENTARIO -CM', nombreConvenio: 'COMPENSAR CAJICA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE CAJICA', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'CAJICA NORDVITAL', codAseguradora: 'COMPLE ML', interlocutorComercial: 'COMPLEMENTARIO -ML', nombreConvenio: 'COMPENSAR CAJICA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE CAJICA', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'LA MESA NORDVITAL', codAseguradora: 'COMPLEMT CE', interlocutorComercial: 'COMPENSAR COMPLEMENTARIO-CE', nombreConvenio: 'COMPENSAR LA MESA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA MESA', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'USS CALERA NORDVITAL', codAseguradora: 'COMPLEMEN CM', interlocutorComercial: 'COMPLEMENTARIO -CM', nombreConvenio: 'COMPENSAR LA CALERA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA CALERA', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'LA MESA NORDVITAL', codAseguradora: 'Sin asignar', interlocutorComercial: 'Sin asignar', nombreConvenio: 'COMPENSAR LA MESA PGP CONTRIBUTIVO', tipoServicio: 'PGP', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA MESA', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'UBATE NORDVITAL', codAseguradora: 'COMPLEMEN CM', interlocutorComercial: 'COMPLEMENTARIO -CM', nombreConvenio: 'COMPENSAR UBATE PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE UBATE', nombreMpio: 'UBATE', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'CAJICA NORDVITAL', codAseguradora: 'COMPLEMT CE', interlocutorComercial: 'COMPENSAR COMPLEMENTARIO-CE', nombreConvenio: 'COMPENSAR CAJICA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE CAJICA', nombreMpio: 'CAJICA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'LA MESA NORDVITAL', codAseguradora: 'COMPLEMEN CM', interlocutorComercial: 'COMPLEMENTARIO -CM', nombreConvenio: 'COMPENSAR LA MESA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA MESA', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'LA MESA NORDVITAL', codAseguradora: 'COMPLEMEN ET', interlocutorComercial: 'COMPLEMENTARIO -ET', nombreConvenio: 'COMPENSAR LA MESA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA MESA', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'USS CALERA NORDVITAL', codAseguradora: 'COMPLEMEN PA', interlocutorComercial: 'COMPLEMENTARIO -PA', nombreConvenio: 'COMPENSAR LA CALERA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA CALERA', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'LA MESA NORDVITAL', codAseguradora: 'COMPLEMEN PA', interlocutorComercial: 'COMPLEMENTARIO -PA', nombreConvenio: 'COMPENSAR LA MESA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA MESA', nombreMpio: 'LA MESA', entidadAdministradora: 'COMPENSAR EPS' },
    { sedeUo: 'USS CALERA NORDVITAL', codAseguradora: 'Sin asignar', interlocutorComercial: 'Sin asignar', nombreConvenio: 'COMPENSAR LA CALERA PLAN COMPLEMENTARIO CONTRIBUTIVO', tipoServicio: 'EVENTO', regimen: 'CONTRIBUTIVO', nombreSede: 'NORDVITAL IPS - SEDE LA CALERA', nombreMpio: 'LA CALERA', entidadAdministradora: 'COMPENSAR EPS' },
  ]) {
    await prisma.catConvenioSap.upsert({
      where: { uk_sap: { sedeUo: item.sedeUo, codAseguradora: item.codAseguradora, interlocutorComercial: item.interlocutorComercial } },
      update: item,
      create: item,
    });
  }
  console.log(`cat_convenio_sap: ${await prisma.catConvenioSap.count()} registros`);

  // ── cat_especialidad ──
  for (const item of [
    { raw: 'ANESTESIOLOGIA', espAjustada: 'ANESTESIOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'AUXILIAR ENFERMERIA', espAjustada: 'AUXILIAR ENFERMERIA', grupoEspecialidad: 'TOMA DE MUESTRAS' },
    { raw: 'CARDIOLOGIA', espAjustada: 'CARDIOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'CARDIOLOGIA PEDIATRICA', espAjustada: 'CARDIOLOGIA PEDIATRICA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'CIRUGIA GENERAL', espAjustada: 'CIRUGIA GENERAL', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'CIRUGIA MAXILOFACIAL', espAjustada: 'CIRUGIA MAXILOFACIAL', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'CIRUGIA PEDIATRICA', espAjustada: 'CIRUGIA PEDIATRICA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'CIRUGIA PLASTICA ESTETICA Y RECONSTRUCTIVA', espAjustada: 'CIRUGIA PLASTICA ESTETICA Y RECONSTRUCTIVA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'CIRUGIA VASCULAR', espAjustada: 'CIRUGIA VASCULAR', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'DERMATOLOGIA', espAjustada: 'DERMATOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'ECOCARDIOGRAMAS', espAjustada: 'ECOCARDIOGRAMAS', grupoEspecialidad: 'AP. DIAGNOSTICO' },
    { raw: 'ECOGRAFIAS', espAjustada: 'ECOGRAFIAS', grupoEspecialidad: 'AP. DIAGNOSTICO' },
    { raw: 'ENDOCRINOLOGIA', espAjustada: 'ENDOCRINOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'ENDODONCIA', espAjustada: 'ENDODONCIA', grupoEspecialidad: 'ODONTOLOGIA' },
    { raw: 'ENFERMERIA', espAjustada: 'ENFERMERIA', grupoEspecialidad: 'ENFERMERIA' },
    { raw: 'FISIOTERAPIA', espAjustada: 'FISIOTERAPIA', grupoEspecialidad: 'AP. TERAPEUTICO' },
    { raw: 'FONOAUDIOLOGIA', espAjustada: 'FONOAUDIOLOGIA', grupoEspecialidad: 'AP. TERAPEUTICO' },
    { raw: 'GINECOLOGIA', espAjustada: 'GINECOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'HIGIENE ORAL', espAjustada: 'HIGIENE ORAL', grupoEspecialidad: 'ODONTOLOGIA' },
    { raw: 'INFECTOLOGIA', espAjustada: 'INFECTOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'MEDICINA DEL TRABAJO O SEGURIDAD Y SALUD EN EL TRABAJO', espAjustada: 'MEDICINA DEL TRABAJO O SEGURIDAD Y SALUD EN EL TRABAJO', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'MEDICINA FAMILIAR', espAjustada: 'MEDICINA FAMILIAR', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'MEDICINA GENERAL', espAjustada: 'MEDICINA GENERAL', grupoEspecialidad: 'MED. GENERAL' },
    { raw: 'MEDICINA INTERNA', espAjustada: 'MEDICINA INTERNA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'NEFROLOGIA', espAjustada: 'NEFROLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'NEUMOLOGIA', espAjustada: 'NEUMOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'NEUROCIRUGIA', espAjustada: 'NEUROCIRUGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'NEUROLOGIA', espAjustada: 'NEUROLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'NUTRICION Y DIETETICA', espAjustada: 'NUTRICION Y DIETETICA', grupoEspecialidad: 'AP. TERAPEUTICO' },
    { raw: 'OBSTETRICIA', espAjustada: 'OBSTETRICIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'ODONTOLOGIA GENERAL', espAjustada: 'ODONTOLOGIA GENERAL', grupoEspecialidad: 'ODONTOLOGIA' },
    { raw: 'OFTALMOLOGIA', espAjustada: 'OFTALMOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'OPTOMETRIA', espAjustada: 'OPTOMETRIA', grupoEspecialidad: 'AP. TERAPEUTICO' },
    { raw: 'ORTOPEDIA Y TRAUMATOLOGIA', espAjustada: 'ORTOPEDIA Y TRAUMATOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'ORTOPEDIA Y TRAUMATOLOGIA PEDIATRICA', espAjustada: 'ORTOPEDIA Y TRAUMATOLOGIA PEDIATRICA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'OTORRINOLARINGOLOGIA', espAjustada: 'OTORRINOLARINGOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'PEDIATRIA', espAjustada: 'PEDIATRIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'PERIODONCIA', espAjustada: 'PERIODONCIA', grupoEspecialidad: 'ODONTOLOGIA' },
    { raw: 'PSICOLOGIA', espAjustada: 'PSICOLOGIA', grupoEspecialidad: 'AP. TERAPEUTICO' },
    { raw: 'PSIQUIATRIA', espAjustada: 'PSIQUIATRIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'RADIOLOGIA E IMAGENES DIAGNOSTICAS', espAjustada: 'RADIOLOGIA E IMAGENES DIAGNOSTICAS', grupoEspecialidad: 'AP. DIAGNOSTICO' },
    { raw: 'REHABILITACION ORAL', espAjustada: 'REHABILITACION ORAL', grupoEspecialidad: 'ODONTOLOGIA' },
    { raw: 'REUMATOLOGIA', espAjustada: 'REUMATOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'TERAPIA OCUPACIONAL', espAjustada: 'TERAPIA OCUPACIONAL', grupoEspecialidad: 'AP. TERAPEUTICO' },
    { raw: 'TRABAJO SOCIAL', espAjustada: 'TRABAJO SOCIAL', grupoEspecialidad: 'AP. TERAPEUTICO' },
    { raw: 'MEDICINA FISICA Y REHABILITACION', espAjustada: 'MEDICINA FISICA Y REHABILITACION', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'ODONTOPEDIATRIA', espAjustada: 'ODONTOPEDIATRIA', grupoEspecialidad: 'ODONTOLOGIA' },
    { raw: 'UROLOGIA', espAjustada: 'UROLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'DOLOR Y CUIDADOS PALIATIVOS', espAjustada: 'DOLOR Y CUIDADOS PALIATIVOS', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'ALERGOLOGIA', espAjustada: 'ALERGOLOGIA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
    { raw: 'ENDOCRINOLOGIA PEDIATRICA', espAjustada: 'ENDOCRINOLOGIA PEDIATRICA', grupoEspecialidad: 'MED. ESPECIALIZADA' },
  ]) {
    await prisma.catEspecialidad.upsert({
      where: { raw: item.raw },
      update: { espAjustada: item.espAjustada, grupoEspecialidad: item.grupoEspecialidad },
      create: item,
    });
  }
  console.log(`cat_especialidad: ${await prisma.catEspecialidad.count()} registros`);

  // ── cat_cups (desde CSV) ──
  const cupsRows = parseCsv(path.join(__dirname, 'data', 'cat_cups.csv'));
  const cupsHeader = cupsRows[0];
  let cupsCount = 0;
  for (let i = 1; i < cupsRows.length; i++) {
    const row = cupsRows[i];
    const codigo = row[cupsHeader.indexOf('codigo')];
    const descripcion = row[cupsHeader.indexOf('descripcion')] || null;
    const homologado = row[cupsHeader.indexOf('homologado')] || null;
    await prisma.catCups.upsert({
      where: { codigo },
      update: { descripcion, homologado },
      create: { codigo, descripcion, homologado },
    });
    cupsCount++;
  }
  console.log(`cat_cups: ${cupsCount} registros`);

  // ── cat_cups_pana (desde CSV) ──
  const panaRows = parseCsv(path.join(__dirname, 'data', 'cat_cups_pana.csv'));
  const panaHeader = panaRows[0];
  let panaCount = 0;
  for (let i = 1; i < panaRows.length; i++) {
    const row = panaRows[i];
    const especialidadCita = row[panaHeader.indexOf('especialidad_cita')];
    const esControl = row[panaHeader.indexOf('es_control')];
    const codigo = row[panaHeader.indexOf('codigo')];
    const homologado = row[panaHeader.indexOf('homologado')];
    await prisma.catCupsPana.upsert({
      where: { uk_pana: { especialidadCita, esControl } },
      update: { codigo, homologado },
      create: { especialidadCita, esControl, codigo, homologado },
    });
    panaCount++;
  }
  console.log(`cat_cups_pana: ${panaCount} registros`);

  // ── festivos (festivos nacionales de Colombia 2025-2026) ──
  // Se insertan como literales DATE via SQL crudo para evitar el desfase de
  // zona horaria que produce convertir un Date de JS a una columna DATE.
  const festivos = [
    '2025-01-01', '2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18', '2025-05-01',
    '2025-06-02', '2025-06-23', '2025-06-30', '2025-07-20', '2025-08-07', '2025-08-18',
    '2025-10-13', '2025-11-03', '2025-11-17', '2025-12-08', '2025-12-25',
    '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
    '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07',
    '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
  ];
  await prisma.$executeRawUnsafe('DELETE FROM festivos');
  await prisma.$executeRawUnsafe(
    `INSERT INTO festivos (dia) VALUES ${festivos.map((d) => `('${d}')`).join(', ')}`,
  );
  console.log(`festivos: ${await prisma.festivo.count()} registros`);

  console.log('\nSeed completado exitosamente.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });