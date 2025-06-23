import { v4 as uuidv4 } from 'uuid';
import { JobStatus, JobOptions, WebhookConfig, Job as JobInterface } from '../types';

export class Job implements JobInterface {
  public id: string;
  public queueName: string;
  public data: any;
  public options: JobOptions;
  public status: JobStatus;
  public progress?: number;
  public result?: any;
  public error?: string;
  public attempts: number = 0;
  public maxAttempts: number;
  public createdAt: Date;
  public processedAt?: Date;
  public completedAt?: Date;
  public failedAt?: Date;
  public webhook?: WebhookConfig;

  constructor(queueName: string, data: any, options?: JobOptions, webhook?: WebhookConfig) {
    this.id = uuidv4();
    this.queueName = queueName;
    this.data = data;
    this.options = options || {};
    this.status = options?.delay && options.delay > 0 ? JobStatus.DELAYED : JobStatus.WAITING;
    this.maxAttempts = options?.attempts || 3;
    this.createdAt = new Date();
    this.webhook = webhook;
  }

  /**
   * Marks the job as active (being processed)
   */
  public markAsActive(): void {
    this.status = JobStatus.ACTIVE;
    this.processedAt = new Date();
  }

  /**
   * Marks the job as completed
   */
  public markAsCompleted(result?: any): void {
    this.status = JobStatus.COMPLETED;
    this.result = result;
    this.completedAt = new Date();
  }

  /**
   * Marks the job as failed
   */
  public markAsFailed(error: string): void {
    this.status = JobStatus.FAILED;
    this.error = error;
    this.failedAt = new Date();
    this.attempts++;
  }

  /**
   * Checks if the job can be reprocessed
   */
  public canRetry(): boolean {
    return this.attempts < this.maxAttempts && this.status === JobStatus.FAILED;
  }

  /**
   * Resets the job for reprocessing
   */
  public resetForRetry(): void {
    if (this.canRetry()) {
      this.status = JobStatus.WAITING;
      this.error = undefined;
      this.processedAt = undefined;
    }
  }

  /**
   * Updates job progress (0-100)
   */
  public updateProgress(progress: number): void {
    this.progress = Math.max(0, Math.min(100, progress));
  }

  /**
   * Checks if the job is ready to be processed (not delayed)
   */
  public isReadyToProcess(): boolean {
    if (this.status !== JobStatus.DELAYED) {
      return this.status === JobStatus.WAITING;
    }

    // Check if delay has passed
    const delay = this.options.delay || 0;
    const readyTime = new Date(this.createdAt.getTime() + delay);
    return new Date() >= readyTime;
  }

  /**
   * Gets the scheduled execution time
   */
  public getScheduledTime(): Date {
    const delay = this.options.delay || 0;
    return new Date(this.createdAt.getTime() + delay);
  }

  /**
   * Converts job to JSON (for Redis storage)
   */
  public toJSON(): any {
    return {
      id: this.id,
      queueName: this.queueName,
      data: this.data,
      options: this.options,
      status: this.status,
      progress: this.progress,
      result: this.result,
      error: this.error,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      createdAt: this.createdAt.toISOString(),
      processedAt: this.processedAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      failedAt: this.failedAt?.toISOString(),
      webhook: this.webhook,
    };
  }

  /**
   * Creates a Job instance from JSON (for Redis retrieval)
   */
  public static fromJSON(json: any): Job {
    const job = new Job(json.queueName, json.data, json.options, json.webhook);

    job.id = json.id;
    job.status = json.status;
    job.progress = json.progress;
    job.result = json.result;
    job.error = json.error;
    job.attempts = json.attempts;
    job.maxAttempts = json.maxAttempts;
    job.createdAt = new Date(json.createdAt);

    if (json.processedAt) job.processedAt = new Date(json.processedAt);
    if (json.completedAt) job.completedAt = new Date(json.completedAt);
    if (json.failedAt) job.failedAt = new Date(json.failedAt);

    return job;
  }
}
