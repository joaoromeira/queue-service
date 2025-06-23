import { Request, Response } from 'express';
import { queueManager } from '../services/queue-manager';
import { redisService } from '../services/redis';
import { logger } from '../utils/logger';

export class SystemController {
  /**
   * Gets system information
   * GET /api/system/info
   */
  public async getSystemInfo(req: Request, res: Response): Promise<void> {
    try {
      const systemInfo = await queueManager.getSystemInfo();

      res.json({
        system: {
          ...systemInfo,
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          memoryUsage: process.memoryUsage(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting system info:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get system information',
      });
    }
  }

  /**
   * Gets system health status
   * GET /api/system/health
   */
  public async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const systemInfo = await queueManager.getSystemInfo();
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      // Basic health checks
      const isHealthy = uptime > 0 && memoryUsage.heapUsed < memoryUsage.heapTotal * 0.9;

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        checks: {
          uptime: uptime > 0,
          memory: memoryUsage.heapUsed < memoryUsage.heapTotal * 0.9,
          queues: systemInfo.queues >= 0,
          workers: systemInfo.workers >= 0,
        },
        system: {
          uptime,
          memoryUsage,
          queues: systemInfo.queues,
          workers: systemInfo.workers,
          totalJobs: systemInfo.totalStats.total,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error in health check:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Gets detailed system metrics
   * GET /api/system/metrics
   */
  public async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const systemInfo = await queueManager.getSystemInfo();
      const workersInfo = queueManager.getAllWorkersInfo();
      const allStats = await queueManager.getAllStats();

      res.json({
        overview: {
          queues: systemInfo.queues,
          workers: systemInfo.workers,
          totalJobs: systemInfo.totalStats,
          uptime: process.uptime(),
          nodeVersion: process.version,
        },
        queues: allStats,
        workers: workersInfo,
        system: {
          platform: process.platform,
          architecture: process.arch,
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting metrics:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get system metrics',
      });
    }
  }

  /**
   * Stops all workers
   * POST /api/system/workers/stop-all
   */
  public async stopAllWorkers(req: Request, res: Response): Promise<void> {
    try {
      await queueManager.stopAllWorkers();

      res.json({
        message: 'All workers stopped successfully',
        timestamp: new Date().toISOString(),
      });

      logger.info('All workers stopped via API');
    } catch (error) {
      logger.error('Error stopping all workers:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to stop all workers',
      });
    }
  }

  /**
   * Cleans all queues
   * POST /api/system/queues/clean-all
   */
  public async cleanAllQueues(req: Request, res: Response): Promise<void> {
    try {
      await queueManager.cleanAllQueues();

      res.json({
        message: 'All queues cleaned successfully',
        timestamp: new Date().toISOString(),
      });

      logger.info('All queues cleaned via API');
    } catch (error) {
      logger.error('Error cleaning all queues:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to clean all queues',
      });
    }
  }

  /**
   * Gets worker information for all queues
   * GET /api/system/workers
   */
  public async getWorkersInfo(req: Request, res: Response): Promise<void> {
    try {
      const workersInfo = queueManager.getAllWorkersInfo();

      res.json({
        workers: workersInfo,
        total: Object.keys(workersInfo).length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting workers info:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get workers information',
      });
    }
  }

  /**
   * Gets queue statistics for all queues
   * GET /api/system/queues
   */
  public async getQueuesStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await queueManager.getAllStats();

      res.json({
        queues: stats,
        total: Object.keys(stats).length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting queues stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get queues statistics',
      });
    }
  }

  /**
   * Gets recent logs (simulated)
   * GET /api/system/logs
   */
  public async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const { level = 'info', limit = '100' } = req.query;

      // Logs are now only available via console output
      // In a complete implementation, we would integrate with a log aggregation service
      res.json({
        message: 'Log retrieval not fully implemented yet',
        info: {
          logLevel: level,
          limit: parseInt(limit as string),
          note: 'Logs are currently only available via console output. Consider integrating with a log aggregation service for production.',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting logs:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get logs',
      });
    }
  }
}
