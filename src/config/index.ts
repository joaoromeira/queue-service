import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // Authentication
  auth: {
    apiToken: process.env.API_TOKEN || '',
  },

  // Queue Configuration
  queue: {
    defaultConcurrency: parseInt(process.env.DEFAULT_CONCURRENCY || '5', 10),
    defaultRetryAttempts: parseInt(process.env.DEFAULT_RETRY_ATTEMPTS || '3', 10),
    defaultRetryDelay: parseInt(process.env.DEFAULT_RETRY_DELAY || '1000', 10),
  },

  // Webhook Configuration
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000', 10),
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required configuration
export function validateConfig(): void {
  const required = [
    { key: 'REDIS_HOST', value: config.redis.host },
    { key: 'API_TOKEN', value: config.auth.apiToken },
  ];

  const missing = required.filter(item => !item.value);

  if (missing.length > 0) {
    const missingKeys = missing.map(item => item.key).join(', ');
    throw new Error(`Missing required environment variables: ${missingKeys}`);
  }
}
