import express from 'express';
import { SystemController } from '../controllers/system-controller';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
const systemController = new SystemController();

// Routes that require authentication
router.use(authMiddleware);

// System information
router.get('/info', systemController.getSystemInfo.bind(systemController));

// Health check
router.get('/health', systemController.getHealth.bind(systemController));

// System metrics
router.get('/metrics', systemController.getMetrics.bind(systemController));

// Workers management
router.get('/workers', systemController.getWorkersInfo.bind(systemController));
router.post('/workers/stop-all', systemController.stopAllWorkers.bind(systemController));

// Queues management
router.get('/queues', systemController.getQueuesStats.bind(systemController));
router.post('/queues/clean-all', systemController.cleanAllQueues.bind(systemController));

// Logs
router.get('/logs', systemController.getLogs.bind(systemController));

export default router;
