import { Request, Response } from 'express';
import { webhookService } from '../services/webhook-service';
import { WebhookConfig } from '../types';
import { logger } from '../utils/logger';

export class WebhookController {
  /**
   * Testa um webhook
   * POST /api/webhooks/test
   */
  public async testWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookConfig: WebhookConfig = req.body;

      // Valida a configuração do webhook
      const validationErrors = webhookService.validateWebhookConfig(webhookConfig);
      if (validationErrors.length > 0) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Invalid webhook configuration',
          details: validationErrors,
        });
        return;
      }

      logger.info('Testing webhook configuration', {
        url: webhookConfig.url,
        method: webhookConfig.method || 'POST',
      });

      const result = await webhookService.testWebhook(webhookConfig);

      if (result.success) {
        res.json({
          message: 'Webhook test successful',
          result: {
            success: result.success,
            statusCode: result.statusCode,
            duration: result.duration,
            responseData: result.responseData,
          },
        });
      } else {
        res.status(400).json({
          message: 'Webhook test failed',
          result: {
            success: result.success,
            statusCode: result.statusCode,
            error: result.error,
            duration: result.duration,
          },
        });
      }

      logger.info('Webhook test completed', {
        url: webhookConfig.url,
        success: result.success,
        statusCode: result.statusCode,
        duration: result.duration,
      });
    } catch (error) {
      logger.error('Error testing webhook:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to test webhook',
      });
    }
  }

  /**
   * Valida configuração de webhook
   * POST /api/webhooks/validate
   */
  public async validateWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookConfig: WebhookConfig = req.body;

      if (!webhookConfig) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Webhook configuration is required',
        });
        return;
      }

      const validationErrors = webhookService.validateWebhookConfig(webhookConfig);

      if (validationErrors.length > 0) {
        res.status(400).json({
          valid: false,
          errors: validationErrors,
          message: 'Webhook configuration is invalid',
        });
      } else {
        res.json({
          valid: true,
          message: 'Webhook configuration is valid',
          config: {
            url: webhookConfig.url,
            method: webhookConfig.method || 'POST',
            timeout: webhookConfig.timeout || 30000,
            retryAttempts: webhookConfig.retryAttempts || 3,
            hasCustomHeaders: !!(
              webhookConfig.headers && Object.keys(webhookConfig.headers).length > 0
            ),
          },
        });
      }
    } catch (error) {
      logger.error('Error validating webhook:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to validate webhook',
      });
    }
  }

  /**
   * Obtém documentação sobre o formato do payload
   * GET /api/webhooks/payload-format
   */
  public getPayloadFormat(req: Request, res: Response): void {
    res.json({
      description: 'Webhook payload format for Queue-Service',
      events: ['job.completed', 'job.failed'],
      payloadStructure: {
        event: {
          type: 'string',
          description: 'Event type (job.completed or job.failed)',
          enum: ['job.completed', 'job.failed'],
        },
        job: {
          type: 'object',
          description: 'Job information',
          properties: {
            id: { type: 'string', description: 'Unique job identifier' },
            queueName: { type: 'string', description: 'Name of the queue' },
            status: { type: 'string', description: 'Current job status' },
            data: { type: 'any', description: 'Original job data' },
            result: { type: 'any', description: 'Job result (for completed jobs)' },
            error: { type: 'string', description: 'Error message (for failed jobs)' },
            attempts: { type: 'number', description: 'Number of processing attempts' },
            maxAttempts: { type: 'number', description: 'Maximum allowed attempts' },
            createdAt: { type: 'string', description: 'Job creation timestamp (ISO 8601)' },
            processedAt: {
              type: 'string',
              description: 'Job processing start timestamp (ISO 8601)',
            },
            completedAt: { type: 'string', description: 'Job completion timestamp (ISO 8601)' },
            failedAt: { type: 'string', description: 'Job failure timestamp (ISO 8601)' },
          },
        },
        timestamp: {
          type: 'string',
          description: 'Webhook execution timestamp (ISO 8601)',
        },
        webhook: {
          type: 'object',
          description: 'Webhook execution metadata',
          properties: {
            attempt: { type: 'number', description: 'Current webhook attempt number' },
            maxAttempts: { type: 'number', description: 'Maximum webhook attempts' },
          },
        },
      },
      examplePayload: {
        event: 'job.completed',
        job: {
          id: 'job-12345',
          queueName: 'email-queue',
          status: 'completed',
          data: {
            to: 'user@example.com',
            subject: 'Welcome!',
            body: 'Welcome to our service!',
          },
          result: {
            messageId: 'msg-67890',
            sent: true,
          },
          attempts: 1,
          maxAttempts: 3,
          createdAt: '2024-01-15T10:30:00.000Z',
          processedAt: '2024-01-15T10:30:05.000Z',
          completedAt: '2024-01-15T10:30:07.000Z',
        },
        timestamp: '2024-01-15T10:30:07.500Z',
        webhook: {
          attempt: 1,
          maxAttempts: 3,
        },
      },
      responseExpectations: {
        description:
          'Your webhook endpoint should respond with HTTP 2xx status codes for successful processing',
        successCodes: [200, 201, 202, 204],
        retryBehavior: {
          description: 'Queue-Service will retry failed webhooks with exponential backoff',
          initialDelay: '1 second',
          maxDelay: '30 seconds',
          jitter: '±25%',
          defaultMaxAttempts: 3,
        },
      },
    });
  }

  /**
   * Obtém estatísticas de webhooks (placeholder)
   * GET /api/webhooks/stats
   */
  public async getWebhookStats(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Implement real webhook stats collection
      // For now, return mock data
      res.json({
        message: 'Webhook statistics not fully implemented yet',
        placeholder: {
          totalWebhooksExecuted: 0,
          successfulWebhooks: 0,
          failedWebhooks: 0,
          averageResponseTime: 0,
          retryRate: 0,
        },
        note: 'Real-time webhook statistics will be implemented in future versions',
      });
    } catch (error) {
      logger.error('Error getting webhook stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get webhook statistics',
      });
    }
  }
}
