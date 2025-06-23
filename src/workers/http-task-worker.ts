import axios, { AxiosResponse, AxiosError } from 'axios';
import { Queue } from '../models/queue';
import { Job } from '../models/job';
import { logger } from '../utils/logger';
import { config } from '../config';
import { WorkerInterface } from '../types';

export interface HttpTaskPayload {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body: any;
  timeout?: number;
}

/**
 * HTTP Worker that functions like Google Cloud Tasks
 * Makes direct HTTP requests to application endpoints
 */
export class HttpTaskWorker implements WorkerInterface {
  private queue: Queue;
  private concurrency: number;
  private isRunning: boolean = false;
  private activeJobs: Set<string> = new Set();
  private processingPromises: Promise<void>[] = [];
  private delayedJobsInterval?: NodeJS.Timeout;

  constructor(queue: Queue, concurrency?: number) {
    this.queue = queue;
    this.concurrency =
      concurrency || queue.getOptions().concurrency || config.queue.defaultConcurrency;
  }

  /**
   * Starts the HTTP worker
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`HTTP Worker for queue ${this.queue.getName()} is already running`);
      return;
    }

    this.isRunning = true;
    logger.info(
      `Starting HTTP Worker for queue ${this.queue.getName()} with concurrency ${this.concurrency}`
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

    logger.info(`Stopping HTTP Worker for queue ${this.queue.getName()}`);
    this.isRunning = false;

    if (this.delayedJobsInterval) {
      clearInterval(this.delayedJobsInterval);
    }

    await this.waitForActiveJobs();
    logger.info(`HTTP Worker for queue ${this.queue.getName()} stopped`);
  }

  /**
   * Processes jobs continuously
   */
  private async processJobs(): Promise<void> {
    while (this.isRunning) {
      try {
        const job = await this.queue.getNextJob();

        if (!job) {
          await this.sleep(1000);
          continue;
        }

        this.activeJobs.add(job.id);
        await this.processHttpTask(job);
        this.activeJobs.delete(job.id);
      } catch (error) {
        logger.error(
          `Error in HTTP worker processing loop for queue ${this.queue.getName()}:`,
          error
        );
        await this.sleep(5000);
      }
    }
  }

  /**
   * Processes an HTTP Task (like Cloud Tasks)
   */
  private async processHttpTask(job: Job): Promise<void> {
    const startTime = Date.now();
    const httpTask = job.data as HttpTaskPayload;

    try {
      logger.info(`Processing HTTP Task ${job.id}`, {
        jobId: job.id,
        url: httpTask.url,
        method: httpTask.method || 'POST',
        attempt: job.attempts + 1,
        maxAttempts: job.maxAttempts,
      });

      // Make the HTTP call
      const response = await this.makeHttpRequest(httpTask, job);
      const processingTime = Date.now() - startTime;

      // Mark as completed
      await this.queue.completeJob(job, {
        statusCode: response.status,
        responseData: response.data,
        duration: processingTime,
      });

      logger.info(`HTTP Task ${job.id} completed successfully`, {
        jobId: job.id,
        url: httpTask.url,
        statusCode: response.status,
        duration: processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const axiosError = error as AxiosError;

      const errorMessage = axiosError.response
        ? `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`
        : axiosError.message || 'Unknown error';

      logger.error(`HTTP Task ${job.id} failed`, {
        jobId: job.id,
        url: httpTask.url,
        error: errorMessage,
        statusCode: axiosError.response?.status,
        duration: processingTime,
        attempt: job.attempts + 1,
        maxAttempts: job.maxAttempts,
      });

      await this.queue.failJob(job, errorMessage);
    }
  }

  /**
   * Makes the HTTP request to the application endpoint
   */
  private async makeHttpRequest(httpTask: HttpTaskPayload, job: Job): Promise<AxiosResponse> {
    const method = httpTask.method || 'POST';
    const timeout = httpTask.timeout || 30000;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Queue-Service-HttpWorker/1.0',
      'X-Queue-Service-Job-Id': job.id,
      'X-Queue-Service-Attempt': job.attempts.toString(),
      'X-Queue-Service-Max-Attempts': job.maxAttempts.toString(),
      ...httpTask.headers,
    };

    logger.info(`Making HTTP request to ${httpTask.url}`, {
      jobId: job.id,
      method,
      url: httpTask.url,
      headers: Object.keys(headers),
    });

    return await axios({
      method,
      url: httpTask.url,
      data: httpTask.body,
      headers,
      timeout,
      validateStatus: status => status >= 200 && status < 300,
    });
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
    }, 5000);
  }

  /**
   * Waits for active jobs to finish
   */
  private async waitForActiveJobs(): Promise<void> {
    const maxWaitTime = 30000;
    const startTime = Date.now();

    while (this.activeJobs.size > 0 && Date.now() - startTime < maxWaitTime) {
      logger.info(`Waiting for ${this.activeJobs.size} active HTTP tasks to complete...`);
      await this.sleep(1000);
    }

    if (this.activeJobs.size > 0) {
      logger.warn(`Force stopping HTTP worker with ${this.activeJobs.size} active tasks`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  public getActiveJobsCount(): number {
    return this.activeJobs.size;
  }

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
      workerType: 'HTTP',
    };
  }
}
