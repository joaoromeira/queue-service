import { Request, Response } from 'express';
import { queueManager } from '../services/queue-manager';
import { CreateQueueRequest, QueueOptions } from '../types';
import { logger } from '../utils/logger';

export class QueueController {
  /**
   * Creates a new queue
   * POST /api/queues
   */
  public async createQueue(req: Request, res: Response): Promise<void> {
    try {
      const { name, options }: CreateQueueRequest = req.body;

      if (!name) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Queue name is required',
        });
        return;
      }

      // Validates queue name
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Queue name can only contain letters, numbers, underscores and hyphens',
        });
        return;
      }

      const queue = queueManager.createQueue(name, options);

      res.status(201).json({
        message: 'Queue created successfully',
        queue: {
          name: queue.getName(),
          options: queue.getOptions(),
        },
      });

      logger.info(`Queue '${name}' created via API`, {
        queueName: name,
        options,
      });
    } catch (error) {
      logger.error('Error creating queue:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create queue',
      });
    }
  }

  /**
   * Lists all queues
   * GET /api/queues
   */
  public async listQueues(req: Request, res: Response): Promise<void> {
    try {
      const queueNames = queueManager.getQueues();
      const queues = [];

      for (const name of queueNames) {
        const queue = queueManager.getQueue(name);
        if (queue) {
          const stats = await queue.getStats();
          const workerInfo = queueManager.getWorkerInfo(name);

          queues.push({
            name,
            options: queue.getOptions(),
            stats,
            worker: workerInfo,
          });
        }
      }

      res.json({
        queues,
        total: queues.length,
      });
    } catch (error) {
      logger.error('Error listing queues:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list queues',
      });
    }
  }

  /**
   * Gets details of a specific queue
   * GET /api/queues/:name
   */
  public async getQueue(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const queue = queueManager.getQueue(name);

      if (!queue) {
        res.status(404).json({
          error: 'Not found',
          message: `Queue '${name}' not found`,
        });
        return;
      }

      const stats = await queue.getStats();
      const workerInfo = queueManager.getWorkerInfo(name);

      res.json({
        queue: {
          name,
          options: queue.getOptions(),
          stats,
          worker: workerInfo,
        },
      });
    } catch (error) {
      logger.error(`Error getting queue ${req.params.name}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get queue details',
      });
    }
  }

  /**
   * Deletes a queue
   * DELETE /api/queues/:name
   */
  public async deleteQueue(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;

      const removed = await queueManager.removeQueue(name);

      if (!removed) {
        res.status(404).json({
          error: 'Not found',
          message: `Queue '${name}' not found`,
        });
        return;
      }

      res.json({
        message: `Queue '${name}' deleted successfully`,
      });

      logger.info(`Queue '${name}' deleted via API`);
    } catch (error) {
      logger.error(`Error deleting queue ${req.params.name}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete queue',
      });
    }
  }

  /**
   * Cleans a queue (removes all jobs)
   * POST /api/queues/:name/clean
   */
  public async cleanQueue(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const queue = queueManager.getQueue(name);

      if (!queue) {
        res.status(404).json({
          error: 'Not found',
          message: `Queue '${name}' not found`,
        });
        return;
      }

      await queue.clean();

      res.json({
        message: `Queue '${name}' cleaned successfully`,
      });

      logger.info(`Queue '${name}' cleaned via API`);
    } catch (error) {
      logger.error(`Error cleaning queue ${req.params.name}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to clean queue',
      });
    }
  }

  /**
   * Starts a worker for the queue
   * POST /api/queues/:name/worker/start
   */
  public async startWorker(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const { concurrency } = req.body;

      // Check if queue exists
      const queue = queueManager.getQueue(name);
      if (!queue) {
        res.status(404).json({
          error: 'Not found',
          message: `Queue '${name}' not found`,
        });
        return;
      }

      // For now, use a default processor
      // In Phase 4, this will be configurable
      const defaultProcessor = async (job: any) => {
        logger.info(`Processing job ${job.id} with data:`, job.data);

        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        return { processed: true, timestamp: new Date().toISOString() };
      };

      // Register processor if it doesn't exist
      if (!queueManager.getWorkerInfo(name)) {
        queueManager.registerProcessor(name, defaultProcessor);
      }

      const started = await queueManager.startWorker(name, concurrency);

      if (!started) {
        res.status(400).json({
          error: 'Bad request',
          message: `Worker for queue '${name}' is already running`,
        });
        return;
      }

      res.json({
        message: `Worker started for queue '${name}'`,
        worker: queueManager.getWorkerInfo(name),
      });

      logger.info(`Worker started for queue '${name}' via API`);
    } catch (error) {
      logger.error(`Error starting worker for queue ${req.params.name}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to start worker',
      });
    }
  }

  /**
   * Stops a worker for the queue
   * POST /api/queues/:name/worker/stop
   */
  public async stopWorker(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;

      const stopped = await queueManager.stopWorker(name);

      if (!stopped) {
        res.status(404).json({
          error: 'Not found',
          message: `No worker found for queue '${name}'`,
        });
        return;
      }

      res.json({
        message: `Worker stopped for queue '${name}'`,
      });

      logger.info(`Worker stopped for queue '${name}' via API`);
    } catch (error) {
      logger.error(`Error stopping worker for queue ${req.params.name}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to stop worker',
      });
    }
  }
}
