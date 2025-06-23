import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

class RedisService {
  private client: Redis;
  private isConnected = false;

  constructor() {
    this.client = redisClient;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error: Error) => {
      logger.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.info('Redis client disconnected');
      this.isConnected = false;
    });
  }

  public async connect(): Promise<void> {
    // ioredis connects automatically, but let's wait for it to be ready
    try {
      await this.client.ping();
      logger.info('Successfully connected to Redis');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('Disconnected from Redis');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  public getClient(): Redis {
    return this.client;
  }

  public isReady(): boolean {
    return this.isConnected;
  }

  // Health check
  public async ping(): Promise<string> {
    try {
      return await this.client.ping();
    } catch (error) {
      logger.error('Redis ping failed:', error);
      throw error;
    }
  }
}

export const redisService = new RedisService();
