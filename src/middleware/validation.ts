import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { webhookService } from '../services/webhook-service';

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  validator?: (value: any) => boolean;
  message?: string;
}

export function validateRequest(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = getNestedValue(req.body, rule.field);

      // Verifica se é obrigatório
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${rule.field}' is required`);
        continue;
      }

      // Se não é obrigatório e está vazio, pula validação
      if (!rule.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // Verifica tipo
      if (rule.type && !validateType(value, rule.type)) {
        errors.push(`Field '${rule.field}' must be of type ${rule.type}`);
        continue;
      }

      // Verifica comprimento mínimo
      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors.push(`Field '${rule.field}' must be at least ${rule.minLength} characters long`);
      }

      // Verifica comprimento máximo
      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors.push(`Field '${rule.field}' must be at most ${rule.maxLength} characters long`);
      }

      // Verifica padrão regex
      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        errors.push(rule.message || `Field '${rule.field}' has invalid format`);
      }

      // Validador customizado
      if (rule.validator && !rule.validator(value)) {
        errors.push(rule.message || `Field '${rule.field}' is invalid`);
      }
    }

    if (errors.length > 0) {
      logger.warn('Validation failed', {
        path: req.path,
        method: req.method,
        errors,
        body: req.body,
      });

      res.status(400).json({
        error: 'Validation error',
        message: 'Request validation failed',
        details: errors,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware específico para validar webhooks em jobs
 */
export function validateJobWithWebhook(req: Request, res: Response, next: NextFunction): void {
  const { webhook } = req.body;

  if (!webhook) {
    return next(); // Webhook é opcional
  }

  const validationErrors = webhookService.validateWebhookConfig(webhook);

  if (validationErrors.length > 0) {
    logger.warn('Webhook validation failed', {
      path: req.path,
      method: req.method,
      errors: validationErrors,
      webhook,
    });

    res.status(400).json({
      error: 'Webhook validation error',
      message: 'Invalid webhook configuration',
      details: validationErrors,
    });
    return;
  }

  next();
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

function validateType(value: any, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}

// Validações pré-definidas comuns
export const queueValidation = validateRequest([
  {
    field: 'name',
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_-]+$/,
    message: 'Queue name can only contain letters, numbers, underscores and hyphens',
  },
  {
    field: 'options.concurrency',
    type: 'number',
    validator: value => value > 0 && value <= 100,
    message: 'Concurrency must be between 1 and 100',
  },
]);

export const jobValidation = validateRequest([
  {
    field: 'data',
    required: true,
    type: 'object',
  },
  {
    field: 'options.attempts',
    type: 'number',
    validator: value => value > 0 && value <= 10,
    message: 'Attempts must be between 1 and 10',
  },
  {
    field: 'options.delay',
    type: 'number',
    validator: value => value >= 0,
    message: 'Delay must be non-negative',
  },
]);

export const webhookValidation = validateRequest([
  {
    field: 'url',
    required: true,
    type: 'string',
    pattern: /^https?:\/\/.+/,
    message: 'URL must be a valid HTTP/HTTPS URL',
  },
  {
    field: 'method',
    type: 'string',
    validator: value => ['POST', 'PUT', 'PATCH'].includes(value),
    message: 'Method must be POST, PUT, or PATCH',
  },
  {
    field: 'timeout',
    type: 'number',
    validator: value => value > 0 && value <= 300000, // 5 minutos max
    message: 'Timeout must be between 1ms and 300000ms (5 minutes)',
  },
  {
    field: 'retryAttempts',
    type: 'number',
    validator: value => value >= 0 && value <= 10,
    message: 'Retry attempts must be between 0 and 10',
  },
]);
