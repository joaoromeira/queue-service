# Queue-Service

A modern and scalable queue microservice, similar to Google Cloud Tasks and AWS SQS, built with Express.js, TypeScript and Redis.

## ✨ Features

- **FIFO Queues**: Ordered processing (First In, First Out)
- **Parallel Processing**: Configurable concurrency per queue
- **Retry System**: Automatic retries with exponential backoff
- **HTTP Tasks**: Google Cloud Tasks-style HTTP task execution
- **Webhooks**: Automatic HTTP callbacks on task completion
- **Real-time Metrics**: Performance and status monitoring
- **REST API**: Complete interface for management
- **Authentication**: Token-based security
- **TypeScript**: Type safety and robust development

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Redis Server
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd queue-service
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```bash
cp env.example .env
# Edit the .env file with your configurations
```

4. Start Redis (if not running):

```bash
redis-server
# or using Docker
docker run -d -p 6379:6379 redis:alpine
```

5. Run the project:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 🔗 API Endpoints

### Health Check

```http
GET /health                    # Public health check
GET /api/system/health         # Detailed health check (requires auth)
```

### Queues

```http
POST /api/queues               # Create queue
GET /api/queues                # List all queues
GET /api/queues/:name          # Get queue details
DELETE /api/queues/:name       # Delete queue
POST /api/queues/:name/clean   # Clean queue (remove all jobs)
```

### Workers

```http
POST /api/queues/:name/worker/start    # Start worker
POST /api/queues/:name/worker/stop     # Stop worker
```

### Jobs

```http
POST /api/queues/:queueName/jobs       # Add job to queue
GET /api/queues/:queueName/jobs        # List jobs from queue
GET /api/jobs/:jobId?queueName=name    # Get job details
DELETE /api/jobs/:jobId?queueName=name # Remove/cancel job
POST /api/jobs/:jobId/retry?queueName=name # Force job retry
```

### HTTP Tasks (Cloud Tasks Style)

```http
POST /api/tasks                # Create HTTP task
GET /api/tasks                 # List HTTP tasks
GET /api/tasks/:taskId         # Get task details
DELETE /api/tasks/:taskId      # Cancel task
POST /api/tasks/:taskId/retry  # Retry failed task
```

### System and Metrics

```http
GET /api/system/info           # System information
GET /api/system/metrics        # Detailed metrics
GET /api/system/logs           # System logs
POST /api/system/workers/stop-all     # Stop all workers
POST /api/system/queues/clean-all     # Clean all queues
```

## 📋 Usage Examples

### HTTP Tasks (Google Cloud Tasks Style)

```javascript
const axios = require('axios');

// Create HTTP Task
const response = await axios.post(
  'http://localhost:3000/api/tasks',
  {
    url: 'https://your-app.com/api/process-data',
    method: 'POST',
    payload: {
      userId: '123',
      action: 'send-email',
      data: { email: 'user@example.com' },
    },
    options: {
      attempts: 3,
      delay: 5000,
      timeout: 30000,
    },
    queueName: 'my-http-queue',
  },
  {
    headers: { Authorization: 'Bearer your-token' },
  }
);

console.log('Task created:', response.data.task.id);
```

### Traditional Job Processing

```javascript
// Create a Queue
await axios.post(
  'http://localhost:3000/api/queues',
  {
    name: 'email-queue',
    options: { concurrency: 3 },
  },
  {
    headers: { Authorization: 'Bearer your-token' },
  }
);

// Add a Job
await axios.post(
  'http://localhost:3000/api/queues/email-queue/jobs',
  {
    data: {
      to: 'user@example.com',
      subject: 'Welcome!',
      body: 'Welcome to our service!',
    },
    options: {
      attempts: 3,
      delay: 0,
    },
    webhook: {
      url: 'https://your-app.com/webhook',
      method: 'POST',
    },
  },
  {
    headers: { Authorization: 'Bearer your-token' },
  }
);

// Start Worker
await axios.post(
  'http://localhost:3000/api/queues/email-queue/worker/start',
  {
    concurrency: 5,
  },
  {
    headers: { Authorization: 'Bearer your-token' },
  }
);
```

## 🛠️ Available Scripts

```bash
npm run dev        # Development with watch
npm run build      # Build for production
npm start          # Run built version
npm run lint       # Run ESLint
npm run lint:fix   # Fix ESLint issues
npm test           # Run tests
npm run test:watch # Run tests in watch mode
```

## 🏗️ Architecture

```
src/
├── config/         # Configurations
├── models/         # Data models (Job, Queue)
├── services/       # Services (Redis, QueueManager)
├── controllers/    # API controllers
├── middleware/     # Express middlewares
├── routes/         # Route definitions
├── workers/        # Processing workers
├── utils/          # Utilities
└── types/          # TypeScript definitions
```

## 🐳 Docker Support

Use the included Docker Compose for easy setup:

```bash
# Start Redis and optional Redis Commander
docker-compose up redis redis-commander

# Or start everything including Queue-Service
docker-compose up
```

## 📊 Development Status

- [x] **Phase 1**: Base structure and configuration
- [x] **Phase 2**: Core queue system
  - [x] Job class with states and retry
  - [x] Queue class with FIFO operations
  - [x] Worker class with parallel processing
  - [x] QueueManager for coordination
  - [x] Retry system with exponential backoff
  - [x] Complete Redis persistence
- [x] **Phase 3**: REST API
  - [x] Controllers for queues, jobs and system
  - [x] Organized and authenticated routes
  - [x] Validation middleware
  - [x] Robust error handling
  - [x] Endpoints for metrics and monitoring
- [x] **Phase 4**: HTTP Tasks system
  - [x] Google Cloud Tasks-style HTTP task execution
  - [x] HTTP Task Worker with direct endpoint calling
  - [x] Task management API
  - [x] Automatic worker initialization
- [x] **Phase 5**: Webhook system
  - [x] Automatic webhook execution on job completion/failure
  - [x] Configurable retry for webhooks
  - [x] Webhook validation and testing endpoints

## 🌟 Key Features

### HTTP Tasks (Like Google Cloud Tasks)

The system supports HTTP tasks that work exactly like Google Cloud Tasks:

1. **Create Task**: Provide URL + payload
2. **Queue-Service Processing**: Makes HTTP requests to your endpoints
3. **Your Application**: Receives and processes the data

This allows complete decoupling - your application just needs to handle HTTP requests!

### Traditional Job Processing

For more complex scenarios, you can register custom processors and handle jobs programmatically.

### Reliability Features

- **FIFO Guarantee**: Jobs are processed in order
- **Automatic Retries**: Failed jobs are retried with exponential backoff
- **Webhook Support**: Get notified when jobs complete or fail
- **Monitoring**: Complete metrics and monitoring capabilities
- **Graceful Shutdown**: Proper cleanup on termination

## 📄 License

MIT
