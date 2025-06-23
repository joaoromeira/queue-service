import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { redisService } from './services/redis';

// Routes
import queueRoutes from './routes/queue-routes';
import jobRoutes from './routes/job-routes';
import systemRoutes from './routes/system-routes';

async function startServer(): Promise<void> {
  try {
    // Check if config is valid
    validateConfig();
    logger.info('Configuration validated successfully');

    // Get Redis connection ready
    await redisService.connect();

    // Set up Express
    const app = express();

    // Security stuff
    app.use(helmet());
    app.use(cors());

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Log incoming requests
    app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      next();
    });

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        const redisPing = await redisService.ping();
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          redis: redisPing === 'PONG' ? 'connected' : 'disconnected',
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          redis: 'disconnected',
        });
      }
    });

    // API endpoints
    app.use('/api/queues', queueRoutes);
    app.use('/api', jobRoutes);
    app.use('/api/system', systemRoutes);

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        name: 'Queue-Service',
        version: '1.0.0',
        description: 'Microservice for queue management',
        status: 'running',
        endpoints: {
          health: '/health',
          queues: '/api/queues',
          jobs: '/api/queues/:queueName/jobs',
          system: '/api/system',
        },
        documentation: {
          swagger: '/api/docs', // TODO: Add Swagger docs
          postman: '/api/postman', // TODO: Add Postman collection
        },
      });
    });

    // Catch any errors
    app.use(
      (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
        logger.error('Unhandled error:', err);
        res.status(500).json({
          error: 'Internal server error',
          message: config.server.nodeEnv === 'development' ? err.message : 'Something went wrong',
        });
      }
    );

    // Handle 404s
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: {
          health: 'GET /health',
          queues: 'GET /api/queues',
          createQueue: 'POST /api/queues',
          createJob: 'POST /api/queues/:queueName/jobs',
          systemInfo: 'GET /api/system/info',
          metrics: 'GET /api/system/metrics',
        },
      });
    });

    // Fire up the server
    const server = app.listen(config.server.port, () => {
      logger.info(
        `🚀 Queue-Service server running on port ${config.server.port} in ${config.server.nodeEnv} mode`
      );
      logger.info(`📊 Health check: http://localhost:${config.server.port}/health`);
      logger.info(`🔗 API Base URL: http://localhost:${config.server.port}/api`);
    });

    // Handle shutdown gracefully
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await redisService.disconnect();
          logger.info('All connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Let's go!
startServer().catch(error => {
  logger.error('Unhandled error during server startup:', error);
  process.exit(1);
});
