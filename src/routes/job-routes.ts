import express from 'express';
import { JobController } from '../controllers/job-controller';
import { authMiddleware } from '../middleware/auth';
import { jobValidation, validateJobWithWebhook } from '../middleware/validation';

const router = express.Router();
const jobController = new JobController();

// Routes that require authentication
router.use(authMiddleware);

// Add job to queue
router.post('/queues/:queueName/jobs', jobController.addJob.bind(jobController));

// List jobs from queue
router.get('/queues/:queueName/jobs', jobController.listJobs.bind(jobController));

// Remove job
router.delete('/jobs/:jobId', jobController.removeJob.bind(jobController));

// Get job details
router.get('/jobs/:jobId', jobController.getJob.bind(jobController));

// Retry job
router.post('/jobs/:jobId/retry', jobController.retryJob.bind(jobController));

// Alternative routes for cleaner URLs
router.post('/', authMiddleware, jobValidation, validateJobWithWebhook, (req, res) =>
  jobController.addJob(req, res)
);
router.delete('/:id', jobController.removeJob.bind(jobController));

export default router;
