import axios, { AxiosResponse, AxiosError } from 'axios';
import { Job } from '../models/job';
import { WebhookConfig } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface WebhookPayload {
  event: 'job.completed' | 'job.failed';
  job: {
    id: string;
    queueName: string;
    status: string;
    data: any;
    result?: any;
    error?: string;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    processedAt?: string;
    completedAt?: string;
    failedAt?: string;
  };
  timestamp: string;
  webhook: {
    attempt: number;
    maxAttempts: number;
  };
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  responseData?: any;
  error?: string;
  duration: number;
  attempt: number;
}

export class WebhookService {
  private maxRetries: number;
  private timeout: number;

  constructor() {
    this.maxRetries = config.webhook.retryAttempts;
    this.timeout = config.webhook.timeout;
  }

  /**
   * Executa um webhook com retry automático
   */
  public async executeWebhook(
    job: Job,
    event: 'job.completed' | 'job.failed',
    webhookConfig: WebhookConfig
  ): Promise<WebhookResult> {
    const payload = this.createPayload(job, event, 1);

    return await this.executeWithRetry(
      webhookConfig,
      payload,
      1,
      webhookConfig.retryAttempts || this.maxRetries
    );
  }

  /**
   * Executa webhook com retry
   */
  private async executeWithRetry(
    webhookConfig: WebhookConfig,
    payload: WebhookPayload,
    attempt: number,
    maxAttempts: number
  ): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      logger.info(`Executing webhook attempt ${attempt}/${maxAttempts}`, {
        jobId: payload.job.id,
        event: payload.event,
        url: webhookConfig.url,
        attempt,
        maxAttempts,
      });

      // Update payload with current attempt
      const webhookPayload = {
        ...payload,
        attempt: attempt,
        maxAttempts: maxAttempts,
      };

      const response = await this.makeHttpRequest(webhookConfig, webhookPayload);
      const duration = Date.now() - startTime;

      const result: WebhookResult = {
        success: true,
        statusCode: response.status,
        responseData: response.data,
        duration,
        attempt,
      };

      logger.info(`Webhook executed successfully`, {
        jobId: payload.job.id,
        event: payload.event,
        url: webhookConfig.url,
        statusCode: response.status,
        duration,
        attempt,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const axiosError = error as AxiosError;

      const errorMessage = axiosError.response
        ? `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`
        : axiosError.message || 'Unknown error';

      logger.warn(`Webhook attempt ${attempt} failed`, {
        jobId: payload.job.id,
        event: payload.event,
        url: webhookConfig.url,
        error: errorMessage,
        statusCode: axiosError.response?.status,
        duration,
        attempt,
        maxAttempts,
      });

      // If not the last attempt, retry
      if (attempt < maxAttempts) {
        const delay = this.calculateRetryDelay(attempt);
        logger.info(`Webhook failed, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);

        await this.sleep(delay);
        return await this.executeWithRetry(webhookConfig, payload, attempt + 1, maxAttempts);
      }

      // Last attempt failed
      const result: WebhookResult = {
        success: false,
        statusCode: axiosError.response?.status,
        error: errorMessage,
        duration,
        attempt,
      };

      logger.error(`Webhook failed after ${maxAttempts} attempts`, {
        jobId: payload.job.id,
        event: payload.event,
        url: webhookConfig.url,
        error: errorMessage,
        totalAttempts: maxAttempts,
      });

      return result;
    }
  }

  /**
   * Faz a requisição HTTP
   */
  private async makeHttpRequest(
    webhookConfig: WebhookConfig,
    payload: WebhookPayload
  ): Promise<AxiosResponse> {
    const method = webhookConfig.method || 'POST';
    const timeout = webhookConfig.timeout || this.timeout;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Queue-Service-Webhook/1.0',
      ...webhookConfig.headers,
    };

    return await axios({
      method,
      url: webhookConfig.url,
      data: payload,
      headers,
      timeout,
      validateStatus: status => status >= 200 && status < 300,
    });
  }

  /**
   * Cria o payload do webhook
   */
  private createPayload(
    job: Job,
    event: 'job.completed' | 'job.failed',
    attempt: number
  ): WebhookPayload {
    return {
      event,
      job: {
        id: job.id,
        queueName: job.queueName,
        status: job.status,
        data: job.data,
        result: job.result,
        error: job.error,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: job.createdAt.toISOString(),
        processedAt: job.processedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        failedAt: job.failedAt?.toISOString(),
      },
      timestamp: new Date().toISOString(),
      webhook: {
        attempt,
        maxAttempts: this.maxRetries,
      },
    };
  }

  /**
   * Calcula delay para retry com backoff exponencial
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

    // Add some jitter (±25% random variation)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }

  /**
   * Utilitário para aguardar
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Valida configuração de webhook
   */
  public validateWebhookConfig(webhookConfig: WebhookConfig): string[] {
    const errors: string[] = [];

    if (!webhookConfig.url) {
      errors.push('Webhook URL is required');
    } else if (!/^https?:\/\/.+/.test(webhookConfig.url)) {
      errors.push('Webhook URL must be a valid HTTP/HTTPS URL');
    }

    if (webhookConfig.method && !['POST', 'PUT', 'PATCH'].includes(webhookConfig.method)) {
      errors.push('Webhook method must be POST, PUT, or PATCH');
    }

    if (webhookConfig.timeout && (webhookConfig.timeout < 1000 || webhookConfig.timeout > 300000)) {
      errors.push('Webhook timeout must be between 1000ms and 300000ms');
    }

    if (
      webhookConfig.retryAttempts &&
      (webhookConfig.retryAttempts < 0 || webhookConfig.retryAttempts > 10)
    ) {
      errors.push('Webhook retry attempts must be between 0 and 10');
    }

    return errors;
  }

  /**
   * Testa um webhook (para debugging)
   */
  public async testWebhook(webhookConfig: WebhookConfig): Promise<WebhookResult> {
    const testPayload: WebhookPayload = {
      event: 'job.completed',
      job: {
        id: 'test-job-id',
        queueName: 'test-queue',
        status: 'completed',
        data: { test: true },
        result: { success: true },
        attempts: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      webhook: {
        attempt: 1,
        maxAttempts: 1,
      },
    };

    const startTime = Date.now();

    try {
      const response = await this.makeHttpRequest(webhookConfig, testPayload);
      const duration = Date.now() - startTime;

      return {
        success: true,
        statusCode: response.status,
        responseData: response.data,
        duration,
        attempt: 1,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const axiosError = error as AxiosError;

      return {
        success: false,
        statusCode: axiosError.response?.status,
        error: axiosError.response
          ? `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`
          : axiosError.message || 'Unknown error',
        duration,
        attempt: 1,
      };
    }
  }
}

// Single instance
export const webhookService = new WebhookService();
