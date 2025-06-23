import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Job } from './job';
import { QueueOptions, QueueStats, ProcessorFunction, JobStatus } from '../types';
import { redisService } from '../services/redis';
import { logger } from '../utils/logger';
import { config } from '../config';

export class Queue {
  private name: string;
  private options: QueueOptions;
  private redis: Redis;

  // Redis keys
  private keysPrefix: string;
  private activeKey: string;
  private waitingKey: string;
  private completedKey: string;
  private failedKey: string;
  private delayedKey: string;
  private jobsKey: string;
  private statsKey: string;

  constructor(name: string, options: QueueOptions = {}) {
    this.name = name;
    this.options = {
      concurrency: config.queue.defaultConcurrency,
      removeOnComplete: true,
      removeOnFail: false,
      ...options,
    };

    this.redis = redisService.getClient();

    // Define as chaves Redis
    this.keysPrefix = `queue:${name}`;
    this.activeKey = `${this.keysPrefix}:active`;
    this.waitingKey = `${this.keysPrefix}:waiting`;
    this.completedKey = `${this.keysPrefix}:completed`;
    this.failedKey = `${this.keysPrefix}:failed`;
    this.delayedKey = `${this.keysPrefix}:delayed`;
    this.jobsKey = `${this.keysPrefix}:jobs`;
    this.statsKey = `${this.keysPrefix}:stats`;
  }

  /**
   * Gets the queue name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Gets the queue options
   */
  public getOptions(): QueueOptions {
    return { ...this.options };
  }

  /**
   * Adds a job to the queue
   */
  public async addJob(job: Job): Promise<void> {
    // Store job data
    await this.redis.hset(this.jobsKey, job.id, JSON.stringify(job.toJSON()));

    // Add to appropriate queue based on status
    if (job.status === JobStatus.DELAYED) {
      // For delayed jobs, use sorted set with timestamp
      const executeAt = job.getScheduledTime().getTime();
      await this.redis.zadd(this.delayedKey, executeAt, job.id);
    } else {
      // Add to waiting queue (FIFO)
      await this.redis.lpush(this.waitingKey, job.id);
    }

    // Update statistics
    await this.updateStats('totalJobs', 1);

    logger.info(`Job ${job.id} added to queue ${this.name}`, {
      jobId: job.id,
      queueName: this.name,
      status: job.status,
    });
  }

  /**
   * Gets the next available job for processing
   */
  public async getNextJob(): Promise<Job | null> {
    // First, process any delayed jobs that are ready
    await this.processDelayedJobs();

    // Get job from waiting queue
    const jobId = await this.redis.brpop(this.waitingKey, 1);
    if (!jobId) {
      return null;
    }

    // Get job data
    const jobData = await this.redis.hget(this.jobsKey, jobId[1]);
    if (!jobData) {
      logger.warn(`Job data not found for job ${jobId[1]} in queue ${this.name}`);
      return null;
    }

    const job = Job.fromJSON(JSON.parse(jobData));

    // Mark as active
    job.markAsActive();
    await this.redis.lpush(this.activeKey, job.id);
    await this.redis.hset(this.jobsKey, job.id, JSON.stringify(job.toJSON()));

    return job;
  }

  /**
   * Marks a job as completed
   */
  public async completeJob(job: Job, result?: any): Promise<void> {
    job.markAsCompleted(result);

    // Remove from active queue
    await this.redis.lrem(this.activeKey, 1, job.id);

    // Add to completed queue (if configured)
    if (!this.options.removeOnComplete) {
      await this.redis.lpush(this.completedKey, job.id);
    }

    // Update job data
    await this.redis.hset(this.jobsKey, job.id, JSON.stringify(job.toJSON()));

    // Remove job if configured to remove
    if (this.options.removeOnComplete) {
      await this.redis.hdel(this.jobsKey, job.id);
    }

    // Update statistics
    await this.updateStats('completedJobs', 1);

    logger.info(`Job ${job.id} completed in queue ${this.name}`);
  }

  /**
   * Marks a job as failed
   */
  public async failJob(job: Job, error: string): Promise<void> {
    job.markAsFailed(error);

    // Remove from active queue
    await this.redis.lrem(this.activeKey, 1, job.id);

    // Check if can retry
    if (job.canRetry()) {
      // Re-add to waiting queue with exponential backoff delay
      const retryDelay = this.calculateRetryDelay(job.attempts);
      const executeAt = Date.now() + retryDelay;

      job.status = JobStatus.DELAYED;
      await this.redis.zadd(this.delayedKey, executeAt, job.id);

      logger.info(
        `Job ${job.id} scheduled for retry in ${retryDelay}ms (attempt ${job.attempts + 1}/${job.maxAttempts})`
      );
    } else {
      // Move to failed queue
      if (!this.options.removeOnFail) {
        await this.redis.lpush(this.failedKey, job.id);
      }

      // Update statistics
      await this.updateStats('failedJobs', 1);

      logger.error(`Job ${job.id} permanently failed in queue ${this.name}: ${error}`);
    }

    // Update job data
    await this.redis.hset(this.jobsKey, job.id, JSON.stringify(job.toJSON()));

    // Remove job if configured to remove
    if (this.options.removeOnFail && !job.canRetry()) {
      await this.redis.hdel(this.jobsKey, job.id);
    }
  }

  /**
   * Processes delayed jobs that are ready to execute
   */
  public async processDelayedJobs(): Promise<void> {
    const now = Date.now();

    // Get delayed jobs that are ready to process
    const readyJobs = await this.redis.zrangebyscore(this.delayedKey, 0, now);

    for (const jobId of readyJobs) {
      // Remove from delayed queue
      await this.redis.zrem(this.delayedKey, jobId);

      // Get job data and update status
      const jobData = await this.redis.hget(this.jobsKey, jobId);
      if (jobData) {
        const job = Job.fromJSON(JSON.parse(jobData));
        job.status = JobStatus.WAITING;
        await this.redis.hset(this.jobsKey, jobId, JSON.stringify(job.toJSON()));

        // Add to waiting queue
        await this.redis.lpush(this.waitingKey, jobId);
      }
    }
  }

  /**
   * Gets a specific job by ID
   */
  public async getJob(jobId: string): Promise<Job | null> {
    const jobData = await this.redis.hget(this.jobsKey, jobId);
    if (!jobData) {
      return null;
    }

    return Job.fromJSON(JSON.parse(jobData));
  }

  /**
   * Removes a job from the queue
   */
  public async removeJob(jobId: string): Promise<boolean> {
    // Try to remove from all possible queues
    const removed = await Promise.all([
      this.redis.lrem(this.waitingKey, 0, jobId),
      this.redis.lrem(this.activeKey, 0, jobId),
      this.redis.lrem(this.completedKey, 0, jobId),
      this.redis.lrem(this.failedKey, 0, jobId),
      this.redis.zrem(this.delayedKey, jobId),
      this.redis.hdel(this.jobsKey, jobId),
    ]);

    const wasRemoved = removed.some(count => count > 0);

    if (wasRemoved) {
      logger.info(`Job ${jobId} removed from queue ${this.name}`);
    }

    return wasRemoved;
  }

  /**
   * Gets queue statistics
   */
  public async getStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.redis.llen(this.waitingKey),
      this.redis.llen(this.activeKey),
      this.redis.llen(this.completedKey),
      this.redis.llen(this.failedKey),
      this.redis.zcard(this.delayedKey),
    ]);

    const total = waiting + active + completed + failed + delayed;

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total,
    };
  }

  /**
   * Cleans the queue (removes all jobs)
   */
  public async clean(): Promise<void> {
    await Promise.all([
      this.redis.del(this.waitingKey),
      this.redis.del(this.activeKey),
      this.redis.del(this.completedKey),
      this.redis.del(this.failedKey),
      this.redis.del(this.delayedKey),
      this.redis.del(this.jobsKey),
      this.redis.del(this.statsKey),
    ]);

    logger.info(`Queue ${this.name} cleaned`);
  }

  /**
   * Updates queue statistics
   */
  private async updateStats(field: string, increment: number): Promise<void> {
    await this.redis.hincrby(this.statsKey, field, increment);
  }

  /**
   * Calculates retry delay with exponential backoff
   */
  private calculateRetryDelay(attempts: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 1 minute
    const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);

    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }
}
