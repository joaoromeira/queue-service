import { Router } from 'express';
import { WebhookController } from '../controllers/webhook-controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const webhookController = new WebhookController();

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

// Documentação e informações públicas
router.get('/payload-format', webhookController.getPayloadFormat.bind(webhookController));

// Validação e teste de webhooks
router.post('/validate', webhookController.validateWebhook.bind(webhookController));
router.post('/test', webhookController.testWebhook.bind(webhookController));

// Estatísticas (placeholder)
router.get('/stats', webhookController.getWebhookStats.bind(webhookController));

export default router;
