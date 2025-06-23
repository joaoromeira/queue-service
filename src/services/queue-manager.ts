import { Queue } from '../models/queue';
import { Job } from '../models/job';
import { Worker } from '../workers/worker';
import {
  QueueOptions,
  ProcessorFunction,
  JobData,
  JobOptions,
  WebhookConfig,
  QueueStats,
  WorkerInterface,
} from '../types';
import { logger } from '../utils/logger';

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, WorkerInterface> = new Map();
  private processors: Map<string, ProcessorFunction> = new Map();

  /**
   * Creates or gets a queue
   */
  public createQueue(name: string, options?: QueueOptions): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, options);
    this.queues.set(name, queue);

    logger.info(`Queue '${name}' created`, {
      queueName: name,
      options,
    });

    return queue;
  }

  /**
   * Gets an existing queue
   */
  public getQueue(name: string): Queue | null {
    return this.queues.get(name) || null;
  }

  /**
   * Lists all queues
   */
  public getQueues(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Removes a queue
   */
  public async removeQueue(name: string): Promise<boolean> {
    const queue = this.queues.get(name);
    if (!queue) {
      return false;
    }

    // Stop the worker if it's running
    if (this.workers.has(name)) {
      const worker = this.workers.get(name)!;
      await worker.stop();
      this.workers.delete(name);
    }

    // Clear the queue
    await queue.clean();

    // Remove from our internal tracking
    this.queues.delete(name);
    this.processors.delete(name);

    logger.info(`Queue '${name}' removed`);
    return true;
  }

  /**
   * Adds a job to the queue
   */
  public async addJob(
    queueName: string,
    data: JobData,
    options?: JobOptions,
    webhook?: WebhookConfig
  ): Promise<Job> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const job = new Job(queueName, data, options, webhook);
    await queue.addJob(job);

    return job;
  }

  /**
   * Gets a job by ID
   */
  public async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      return null;
    }

    return await queue.getJob(jobId);
  }

  /**
   * Removes a job
   */
  public async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      return false;
    }

    return await queue.removeJob(jobId);
  }

  /**
   * Gets queue statistics
   */
  public async getQueueStats(queueName: string): Promise<QueueStats | null> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      return null;
    }

    return await queue.getStats();
  }

  /**
   * Gets statistics for all queues
   */
  public async getAllStats(): Promise<Record<string, QueueStats>> {
    const stats: Record<string, QueueStats> = {};

    for (const [name, queue] of this.queues) {
      try {
        stats[name] = await queue.getStats();
      } catch (error) {
        logger.error(`Failed to get stats for queue ${name}:`, error);
        stats[name] = {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          total: 0,
        };
      }
    }

    return stats;
  }

  /**
   * Registers a processor for a queue
   */
  public registerProcessor(queueName: string, processor: ProcessorFunction): void {
    this.processors.set(queueName, processor);
    logger.info(`Processor registered for queue '${queueName}'`);
  }

  /**
   * Starts a worker for a queue
   */
  public async startWorker(queueName: string, concurrency?: number): Promise<boolean> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const processor = this.processors.get(queueName);
    if (!processor) {
      throw new Error(`No processor registered for queue '${queueName}'`);
    }

    // Check if worker is already running
    if (this.workers.has(queueName)) {
      logger.warn(`Worker for queue '${queueName}' is already running`);
      return false;
    }

    const worker = new Worker(queue, processor, concurrency);
    this.workers.set(queueName, worker);

    // Start the worker in the background
    worker.start().catch(error => {
      logger.error(`Worker for queue '${queueName}' crashed:`, error);
      this.workers.delete(queueName);
    });

    logger.info(`Worker started for queue '${queueName}'`);
    return true;
  }

  /**
   * Stops a worker
   */
  public async stopWorker(queueName: string): Promise<boolean> {
    const worker = this.workers.get(queueName);
    if (!worker) {
      return false;
    }

    await worker.stop();
    this.workers.delete(queueName);

    logger.info(`Worker stopped for queue '${queueName}'`);
    return true;
  }

  /**
   * Gets worker information
   */
  public getWorkerInfo(queueName: string): any {
    const worker = this.workers.get(queueName);
    return worker ? worker.getInfo() : null;
  }

  /**
   * Gets information for all workers
   */
  public getAllWorkersInfo(): Record<string, any> {
    const info: Record<string, any> = {};

    for (const [name, worker] of this.workers) {
      info[name] = worker.getInfo();
    }

    return info;
  }

  /**
   * Stops all workers
   */
  public async stopAllWorkers(): Promise<void> {
    const stopPromises = Array.from(this.workers.values()).map(worker => worker.stop());
    await Promise.all(stopPromises);
    this.workers.clear();

    logger.info('All workers stopped');
  }

  /**
   * Cleans all queues
   */
  public async cleanAllQueues(): Promise<void> {
    const cleanPromises = Array.from(this.queues.values()).map(queue => queue.clean());
    await Promise.all(cleanPromises);

    logger.info('All queues cleaned');
  }

  /**
   * Gets general system summary
   */
  public async getSystemInfo(): Promise<{
    queues: number;
    workers: number;
    totalStats: QueueStats;
  }> {
    const allStats = await this.getAllStats();

    const totalStats: QueueStats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
    };

    for (const stats of Object.values(allStats)) {
      totalStats.waiting += stats.waiting;
      totalStats.active += stats.active;
      totalStats.completed += stats.completed;
      totalStats.failed += stats.failed;
      totalStats.delayed += stats.delayed;
      totalStats.total += stats.total;
    }

    return {
      queues: this.queues.size,
      workers: this.workers.size,
      totalStats,
    };
  }

  /**
   * Starts an HTTP worker for a queue (Cloud Tasks style)
   */
  public async startHttpWorker(queueName: string, concurrency?: number): Promise<boolean> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    // Check if worker is already running
    if (this.workers.has(queueName)) {
      logger.warn(`Worker for queue '${queueName}' is already running`);
      return false;
    }

    const { HttpTaskWorker } = await import('../workers/http-task-worker');
    const worker = new HttpTaskWorker(queue, concurrency);
    this.workers.set(queueName, worker);

    // Start the worker in the background
    worker.start().catch(error => {
      logger.error(`HTTP Worker for queue '${queueName}' crashed:`, error);
      this.workers.delete(queueName);
    });

    logger.info(`HTTP Worker started for queue '${queueName}'`);
    return true;
  }
}

// Single instance
export const queueManager = new QueueManager();
