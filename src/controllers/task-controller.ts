import { Request, Response } from 'express';
import { queueManager } from '../services/queue-manager';
import { logger } from '../utils/logger';
import { HttpTaskPayload } from '../workers/http-task-worker';

export interface CreateTaskRequest {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  payload: any;
  options?: {
    attempts?: number;
    delay?: number;
    timeout?: number;
  };
  queueName?: string;
}

export class TaskController {
  /**
   * Creates an HTTP Task (like Google Cloud Tasks)
   * POST /api/tasks
   */
  public async createTask(req: Request, res: Response): Promise<void> {
    try {
      const {
        url,
        method = 'POST',
        headers,
        payload,
        options,
        queueName = 'default-http-queue',
      }: CreateTaskRequest = req.body;

      // Quick validation
      if (!url) {
        res.status(400).json({
          error: 'Validation error',
          message: 'URL is required',
        });
        return;
      }

      if (!payload) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Payload is required',
        });
        return;
      }

      // Make sure URL is valid
      try {
        new URL(url);
      } catch {
        res.status(400).json({
          error: 'Validation error',
          message: 'Invalid URL format',
        });
        return;
      }

      // Get or create the queue
      let queue = queueManager.getQueue(queueName);
      if (!queue) {
        queue = queueManager.createQueue(queueName, { concurrency: 5 });

        // Auto-start the HTTP worker
        await queueManager.startHttpWorker(queueName);
      }

      // Build the task payload
      const httpTaskData: HttpTaskPayload = {
        url,
        method,
        headers,
        body: payload,
        timeout: options?.timeout || 30000,
      };

      // Add the job to the queue
      const job = await queueManager.addJob(queueName, httpTaskData, {
        attempts: options?.attempts || 3,
        delay: options?.delay || 0,
      });

      res.status(201).json({
        message: 'HTTP Task created successfully',
        task: {
          id: job.id,
          queueName: job.queueName,
          url,
          method,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          createdAt: job.createdAt,
          scheduledFor: options?.delay ? new Date(Date.now() + options.delay) : new Date(),
        },
      });

      logger.info(`HTTP Task ${job.id} created for ${url}`, {
        taskId: job.id,
        url,
        method,
        queueName,
      });
    } catch (error) {
      logger.error('Error creating HTTP Task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create HTTP Task',
      });
    }
  }

  /**
   * Lists tasks from a queue
   * GET /api/tasks
   */
  public async listTasks(req: Request, res: Response): Promise<void> {
    try {
      const { queueName = 'default-http-queue' } = req.query;

      const queue = queueManager.getQueue(queueName as string);
      if (!queue) {
        res.status(404).json({
          error: 'Not found',
          message: `Queue '${queueName}' not found`,
        });
        return;
      }

      const stats = await queue.getStats();

      res.json({
        queueName,
        stats,
        message: 'HTTP Tasks statistics',
      });
    } catch (error) {
      logger.error('Error listing HTTP Tasks:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list HTTP Tasks',
      });
    }
  }

  /**
   * Gets details of a specific task
   * GET /api/tasks/:taskId
   */
  public async getTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const { queueName = 'default-http-queue' } = req.query;

      const job = await queueManager.getJob(queueName as string, taskId);

      if (!job) {
        res.status(404).json({
          error: 'Not found',
          message: `Task '${taskId}' not found`,
        });
        return;
      }

      const httpTask = job.data as HttpTaskPayload;

      res.json({
        task: {
          id: job.id,
          queueName: job.queueName,
          status: job.status,
          url: httpTask.url,
          method: httpTask.method || 'POST',
          payload: httpTask.body,
          result: job.result,
          error: job.error,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          createdAt: job.createdAt,
          processedAt: job.processedAt,
          completedAt: job.completedAt,
          failedAt: job.failedAt,
        },
      });
    } catch (error) {
      logger.error(`Error getting HTTP Task ${req.params.taskId}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get task details',
      });
    }
  }

  /**
   * Cancels a task
   * DELETE /api/tasks/:taskId
   */
  public async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const { queueName = 'default-http-queue' } = req.query;

      const removed = await queueManager.removeJob(queueName as string, taskId);

      if (!removed) {
        res.status(404).json({
          error: 'Not found',
          message: `Task '${taskId}' not found`,
        });
        return;
      }

      res.json({
        message: `Task '${taskId}' cancelled successfully`,
      });

      logger.info(`HTTP Task ${taskId} cancelled`);
    } catch (error) {
      logger.error(`Error deleting HTTP Task ${req.params.taskId}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to cancel task',
      });
    }
  }

  /**
   * Forces retry of a failed task
   * POST /api/tasks/:taskId/retry
   */
  public async retryTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const { queueName = 'default-http-queue' } = req.query;

      const job = await queueManager.getJob(queueName as string, taskId);

      if (!job) {
        res.status(404).json({
          error: 'Not found',
          message: `Task '${taskId}' not found`,
        });
        return;
      }

      if (!job.canRetry()) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Task cannot be retried (max attempts reached or not in failed state)',
        });
        return;
      }

      // Reset for retry
      job.resetForRetry();

      // Add back to queue
      const queue = queueManager.getQueue(queueName as string);
      if (queue) {
        await queue.addJob(job);
      }

      res.json({
        message: `Task '${taskId}' scheduled for retry`,
        task: {
          id: job.id,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
        },
      });

      logger.info(`HTTP Task ${taskId} manually retried`);
    } catch (error) {
      logger.error(`Error retrying HTTP Task ${req.params.taskId}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retry task',
      });
    }
  }
}
