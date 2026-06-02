import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

const logDir = 'logs';

const customFormat = winston.format.printf(({ timestamp, level, message, context }) => {
  const ctx = context ? ` [${context}]` : '';
  return `${timestamp} ${level}${ctx} ${message}`;
});

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    customFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        nestWinstonModuleUtilities.format.nestLike('NordvitalAPI', {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),
    new winston.transports.File({
      filename: `${logDir}/error.log`,
      level: 'error',
      format: winston.format.uncolorize(),
    }),
    new winston.transports.File({
      filename: `${logDir}/combined.log`,
      format: winston.format.uncolorize(),
    }),
  ],
};