import { Request, Response } from 'express';
import { queueManager } from '../services/queue-manager';
import { Job } from '../models/job';
import { CreateJobRequest, JobOptions, WebhookConfig } from '../types';
import { logger } from '../utils/logger';

export class JobController {
  /**
   * Adds a job to the queue
   * POST /api/queues/:queueName/jobs
   */
  public async addJob(req: Request, res: Response): Promise<void> {
    try {
      const { queueName } = req.params;
      const { data, options, webhook }: CreateJobRequest = req.body;

      if (!data) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Job data is required',
        });
        return;
      }

      // Check if queue exists
      const queue = queueManager.getQueue(queueName);
      if (!queue) {
        res.status(404).json({
          error: 'Not found',
          message: `Queue '${queueName}' not found`,
        });
        return;
      }

      const job = await queueManager.addJob(queueName, data, options, webhook);

      res.status(201).json({
        message: 'Job added successfully',
        job: {
          id: job.id,
          queueName: job.queueName,
          status: job.status,
          data: job.data,
          options: job.options,
          webhook: job.webhook,
          createdAt: job.createdAt,
        },
      });

      logger.info(`Job ${job.id} added to queue ${queueName}`, {
        jobId: job.id,
        queueName,
        hasWebhook: !!webhook,
      });
    } catch (error) {
      logger.error(`Error adding job to queue ${req.params.queueName}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to add job',
      });
    }
  }

  /**
   * Lists jobs from a queue
   * GET /api/queues/:queueName/jobs
   */
  public async listJobs(req: Request, res: Response): Promise<void> {
    try {
      const { queueName } = req.params;
      const { status, limit = '50', offset = '0' } = req.query;

      const queue = queueManager.getQueue(queueName);
      if (!queue) {
        res.status(404).json({
          error: 'Not found',
          message: `Queue '${queueName}' not found`,
        });
        return;
      }

      // For now, return queue stats
      // TODO: Implement proper job listing with pagination
      const stats = await queue.getStats();

      res.json({
        queueName,
        stats,
        message: 'Job listing not fully implemented yet - showing queue stats',
        filters: {
          status: status as string,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      logger.error(`Error listing jobs from queue ${req.params.queueName}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list jobs',
      });
    }
  }

  /**
   * Gets job details
   * GET /api/jobs/:jobId
   */
  public async getJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const { queueName } = req.query;

      if (!queueName) {
        res.status(400).json({
          error: 'Validation error',
          message: 'queueName query parameter is required',
        });
        return;
      }

      const job = await queueManager.getJob(queueName as string, jobId);

      if (!job) {
        res.status(404).json({
          error: 'Not found',
          message: `Job '${jobId}' not found in queue '${queueName}'`,
        });
        return;
      }

      res.json({
        job: {
          id: job.id,
          queueName: job.queueName,
          status: job.status,
          data: job.data,
          options: job.options,
          progress: job.progress,
          result: job.result,
          error: job.error,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          webhook: job.webhook,
          createdAt: job.createdAt,
          processedAt: job.processedAt,
          completedAt: job.completedAt,
          failedAt: job.failedAt,
        },
      });
    } catch (error) {
      logger.error(`Error getting job ${req.params.jobId}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get job details',
      });
    }
  }

  /**
   * Removes/cancels a job
   * DELETE /api/jobs/:jobId
   */
  public async removeJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const { queueName } = req.query;

      if (!queueName) {
        res.status(400).json({
          error: 'Validation error',
          message: 'queueName query parameter is required',
        });
        return;
      }

      const removed = await queueManager.removeJob(queueName as string, jobId);

      if (!removed) {
        res.status(404).json({
          error: 'Not found',
          message: `Job '${jobId}' not found in queue '${queueName}'`,
        });
        return;
      }

      res.json({
        message: `Job '${jobId}' removed successfully`,
      });

      logger.info(`Job ${jobId} removed from queue ${queueName}`);
    } catch (error) {
      logger.error(`Error removing job ${req.params.jobId}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to remove job',
      });
    }
  }

  /**
   * Forces job retry
   * POST /api/jobs/:jobId/retry
   */
  public async retryJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const { queueName } = req.query;

      if (!queueName) {
        res.status(400).json({
          error: 'Validation error',
          message: 'queueName query parameter is required',
        });
        return;
      }

      const job = await queueManager.getJob(queueName as string, jobId);

      if (!job) {
        res.status(404).json({
          error: 'Not found',
          message: `Job '${jobId}' not found in queue '${queueName}'`,
        });
        return;
      }

      if (!job.canRetry()) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Job cannot be retried (max attempts reached or not in failed state)',
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
        message: `Job '${jobId}' scheduled for retry`,
        job: {
          id: job.id,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
        },
      });

      logger.info(`Job ${jobId} manually retried in queue ${queueName}`);
    } catch (error) {
      logger.error(`Error retrying job ${req.params.jobId}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retry job',
      });
    }
  }
}
