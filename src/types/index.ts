export interface JobData {
  [key: string]: any;
}

export interface JobOptions {
  attempts?: number;
  delay?: number;
  priority?: number;
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  timeout?: number;
  retryAttempts?: number;
}

export interface QueueOptions {
  concurrency?: number;
  defaultJobOptions?: JobOptions;
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  STALLED = 'stalled',
}

export interface Job {
  id: string;
  queueName: string;
  data: JobData;
  options: JobOptions;
  status: JobStatus;
  progress?: number;
  result?: any;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  webhook?: WebhookConfig;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

export interface ProcessorFunction {
  (job: Job): Promise<any>;
}

export interface QueueMetrics {
  processedJobs: number;
  failedJobs: number;
  avgProcessingTime: number;
  lastProcessedAt?: Date;
}

export interface CreateJobRequest {
  queueName: string;
  data: JobData;
  options?: JobOptions;
  webhook?: WebhookConfig;
}

export interface CreateQueueRequest {
  name: string;
  options?: QueueOptions;
}

export interface WorkerInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  getActiveJobsCount(): number;
  getInfo(): {
    queueName: string;
    concurrency: number;
    isRunning: boolean;
    activeJobs: number;
    workerType?: string;
  };
}
