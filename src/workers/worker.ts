import { Queue } from '../models/queue';
import { Job } from '../models/job';
import { ProcessorFunction } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { webhookService } from '../services/webhook-service';
import { WebhookService } from '../services/webhook-service';
import { WorkerInterface } from '../types';

/**
 * Worker that processes jobs from a queue
 */
export class Worker implements WorkerInterface {
  private queue: Queue;
  private processor: ProcessorFunction;
  private concurrency: number;
  private isRunning: boolean = false;
  private activeJobs: Set<string> = new Set();
  private processingPromises: Promise<void>[] = [];
  private delayedJobsInterval?: NodeJS.Timeout;

  constructor(queue: Queue, processor: ProcessorFunction, concurrency?: number) {
    this.queue = queue;
    this.processor = processor;
    this.concurrency =
      concurrency || queue.getOptions().concurrency || config.queue.defaultConcurrency;
  }

  /**
   * Starts the worker
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`Worker for queue ${this.queue.getName()} is already running`);
      return;
    }

    this.isRunning = true;
    logger.info(
      `Starting worker for queue ${this.queue.getName()} with concurrency ${this.concurrency}`
    );

    // Start processing delayed jobs
    this.startDelayedJobsProcessor();

    // Fire up parallel workers
    const workerPromises = Array.from({ length: this.concurrency }, () => this.processJobs());

    // Wait for all workers to finish
    await Promise.all(workerPromises);
  }

  /**
   * Stops the worker
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping worker for queue ${this.queue.getName()}`);
    this.isRunning = false;

    // Stop processing delayed jobs
    this.stopDelayedJobsProcessor();

    // Wait for active jobs to finish
    await this.waitForActiveJobs();

    logger.info(`Worker for queue ${this.queue.getName()} stopped`);
  }

  /**
   * Processes jobs continuously
   */
  private async processJobs(): Promise<void> {
    while (this.isRunning) {
      try {
        const job = await this.queue.getNextJob();

        if (!job) {
          // No jobs available, take a break
          await this.sleep(1000);
          continue;
        }

        // Add to active jobs list
        this.activeJobs.add(job.id);

        // Process the job
        await this.processJob(job);

        // Remove from active jobs list
        this.activeJobs.delete(job.id);
      } catch (error) {
        logger.error(`Error in worker processing loop for queue ${this.queue.getName()}:`, error);
        await this.sleep(5000); // Wait before trying again
      }
    }
  }

  /**
   * Processes an individual job
   */
  private async processJob(job: Job): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info(`Processing job ${job.id} in queue ${this.queue.getName()}`, {
        jobId: job.id,
        queueName: this.queue.getName(),
        attempt: job.attempts + 1,
        maxAttempts: job.maxAttempts,
        hasWebhook: !!job.webhook,
      });

      // Run the processor
      const result = await this.processor(job);

      // Mark as completed
      await this.queue.completeJob(job, result);

      const processingTime = Date.now() - startTime;
      logger.info(`Job ${job.id} completed successfully in ${processingTime}ms`, {
        jobId: job.id,
        queueName: this.queue.getName(),
        processingTime,
      });

      // Send webhook if configured
      if (job.webhook) {
        await this.executeWebhook(job, 'job.completed');
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Job ${job.id} failed after ${processingTime}ms:`, {
        jobId: job.id,
        queueName: this.queue.getName(),
        error: errorMessage,
        processingTime,
        attempt: job.attempts + 1,
        maxAttempts: job.maxAttempts,
      });

      // Mark as failed
      await this.queue.failJob(job, errorMessage);

      // Execute webhook if configured and this is the final failure
      if (job.webhook && !job.canRetry()) {
        await this.executeWebhook(job, 'job.failed');
      }
    }
  }

  /**
   * Executes webhook for a job
   */
  private async executeWebhook(job: Job, event: 'job.completed' | 'job.failed'): Promise<void> {
    if (!job.webhook) {
      return;
    }

    try {
      logger.info(`Executing webhook for job ${job.id}`, {
        jobId: job.id,
        event,
        url: job.webhook.url,
        method: job.webhook.method || 'POST',
      });

      const result = await webhookService.executeWebhook(job, event, job.webhook);

      if (result.success) {
        logger.info(`Webhook executed successfully for job ${job.id}`, {
          jobId: job.id,
          event,
          statusCode: result.statusCode,
          duration: result.duration,
          attempts: result.attempt,
        });
      } else {
        logger.error(`Webhook failed for job ${job.id}`, {
          jobId: job.id,
          event,
          error: result.error,
          statusCode: result.statusCode,
          duration: result.duration,
          attempts: result.attempt,
        });
      }
    } catch (error) {
      logger.error(`Unexpected error executing webhook for job ${job.id}:`, {
        jobId: job.id,
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Starts the delayed jobs processor
   */
  private startDelayedJobsProcessor(): void {
    this.delayedJobsInterval = setInterval(async () => {
      try {
        await this.queue.processDelayedJobs();
      } catch (error) {
        logger.error(`Error processing delayed jobs for queue ${this.queue.getName()}:`, error);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stops the delayed jobs processor
   */
  private stopDelayedJobsProcessor(): void {
    if (this.delayedJobsInterval) {
      clearInterval(this.delayedJobsInterval);
    }
  }

  /**
   * Waits for all active jobs to finish
   */
  private async waitForActiveJobs(): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeJobs.size > 0 && Date.now() - startTime < maxWaitTime) {
      logger.info(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await this.sleep(1000);
    }

    if (this.activeJobs.size > 0) {
      logger.warn(`Force stopping worker with ${this.activeJobs.size} active jobs`);
    }
  }

  /**
   * Utility for waiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Checks if the worker is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Returns the number of active jobs
   */
  public getActiveJobsCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Returns worker information
   */
  public getInfo(): {
    queueName: string;
    concurrency: number;
    isRunning: boolean;
    activeJobs: number;
    workerType: string;
  } {
    return {
      queueName: this.queue.getName(),
      concurrency: this.concurrency,
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      workerType: 'PROCESSOR',
    };
  }
}
