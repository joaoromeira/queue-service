import winston from 'winston';
import { config } from '../config';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.simple()
);

export const logger = winston.createLogger({
  level: config.logging.level,
  format: config.server.nodeEnv === 'development' ? developmentFormat : logFormat,
  defaultMeta: { service: 'queue-service' },
  transports: [new winston.transports.Console()],
});

// If we're not in production then log to the `console`
if (config.server.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}
