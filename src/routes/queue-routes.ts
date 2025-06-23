import { Router } from 'express';
import { QueueController } from '../controllers/queue-controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const queueController = new QueueController();

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

// Rotas de filas
router.post('/', queueController.createQueue.bind(queueController));
router.get('/', queueController.listQueues.bind(queueController));
router.get('/:name', queueController.getQueue.bind(queueController));
router.delete('/:name', queueController.deleteQueue.bind(queueController));

// Operações especiais de filas
router.post('/:name/clean', queueController.cleanQueue.bind(queueController));

// Controle de workers
router.post('/:name/worker/start', queueController.startWorker.bind(queueController));
router.post('/:name/worker/stop', queueController.stopWorker.bind(queueController));

export default router;
