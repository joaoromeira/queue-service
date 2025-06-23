import express from 'express';
import { TaskController } from '../controllers/task-controller';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = express.Router();
const taskController = new TaskController();

// Validação específica para tasks HTTP
const validateTaskCreation = validateRequest([
  {
    field: 'url',
    required: true,
    type: 'string',
    pattern: /^https?:\/\/.+/,
    message: 'URL must be a valid HTTP/HTTPS URL',
  },
  {
    field: 'payload',
    required: true,
    type: 'object',
  },
  {
    field: 'method',
    type: 'string',
    validator: value => ['POST', 'PUT', 'PATCH'].includes(value),
    message: 'Method must be POST, PUT, or PATCH',
  },
  {
    field: 'options.attempts',
    type: 'number',
    validator: value => value > 0 && value <= 10,
    message: 'Attempts must be between 1 and 10',
  },
  {
    field: 'options.delay',
    type: 'number',
    validator: value => value >= 0,
    message: 'Delay must be non-negative',
  },
  {
    field: 'options.timeout',
    type: 'number',
    validator: value => value > 0 && value <= 300000,
    message: 'Timeout must be between 1ms and 300000ms (5 minutes)',
  },
]);

/**
 * Rotas para HTTP Tasks (Google Cloud Tasks style)
 */

// Criar HTTP Task
router.post('/', authMiddleware, validateTaskCreation, (req, res) =>
  taskController.createTask(req, res)
);

// Listar tasks de uma fila
router.get('/', authMiddleware, (req, res) => taskController.listTasks(req, res));

// Obter detalhes de uma task
router.get('/:taskId', authMiddleware, (req, res) => taskController.getTask(req, res));

// Cancelar uma task
router.delete('/:taskId', authMiddleware, (req, res) => taskController.deleteTask(req, res));

// Forçar retry de uma task
router.post('/:taskId/retry', authMiddleware, (req, res) => taskController.retryTask(req, res));

export default router;
