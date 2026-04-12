# Social Media Automation System (SMAS)

A microservices platform for scheduling and publishing social media content across X/Twitter, LinkedIn, Facebook, and Instagram.

## Prerequisites

- Node.js 18+
- PostgreSQL (running on localhost:5432)
- Redis (running on localhost:6379)
- RabbitMQ (running on localhost:5672)

## Services

| Service | Directory | Port |
|---|---|---|
| Auth | `services/auth` | 8001 |
| Content | `services/content` | 8002 |
| Schedule | `services/schedule` | 8003 |
| Analytics | `services/analytics` | 8004 |
| Publisher Worker | `workers/publisher` | — |
| Frontend | `frontend` | 5173 |

## Environment Variables

Create a `.env` file or export these before starting each service. Shared variables apply to all services.

### Shared (all services)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/smas
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
SECRET_KEY=change-me-in-production
```

### Auth Service (`services/auth`)

```
ENCRYPTION_KEY=32-byte-hex-key-here
FRONTEND_URL=http://localhost:5173
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_REDIRECT_URI=http://localhost:8001/auth/oauth/twitter/callback
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=http://localhost:8001/auth/oauth/linkedin/callback
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_REDIRECT_URI=http://localhost:8001/auth/oauth/facebook/callback
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_REDIRECT_URI=http://localhost:8001/auth/oauth/instagram/callback
```

### Content Service (`services/content`)

```
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=smas-media
CDN_BASE_URL=http://localhost:9000/smas-media
OPENAI_API_KEY=...        # optional — for GPT-4 AI generation
ANTHROPIC_API_KEY=...     # optional — for Claude AI generation
OLLAMA_BASE_URL=http://localhost:11434  # optional — for Llama
```

## Setup

### 1. Install dependencies

```bash
npm install                    # root workspace
cd shared && npm install
cd services/auth && npm install
cd services/content && npm install
cd services/schedule && npm install
cd services/analytics && npm install
cd workers/publisher && npm install
cd frontend && npm install
```

### 2. Run Prisma migrations

```bash
cd shared
npx prisma migrate dev
```

### 3. Apply audit log read-only policy (optional)

```bash
psql $DATABASE_URL -f infra/audit_logs_readonly.sql
```

## Running Locally

Start each service in a separate terminal, or use the provided `start-dev.sh` script.

### Individual terminals

```bash
# Auth Service
cd services/auth && npm run dev

# Content Service
cd services/content && npm run dev

# Schedule Service
cd services/schedule && npm run dev

# Analytics Service
cd services/analytics && npm run dev

# Publisher Worker
cd workers/publisher && npx ts-node src/index.ts

# Frontend
cd frontend && npm run dev
```

### All at once (background processes)

```bash
chmod +x start-dev.sh
./start-dev.sh
```

## End-to-End Flow

1. **Create post** — `POST /posts` (Content Service :8002) creates a Post + Platform_Post records
2. **Schedule** — `POST /schedules` (Schedule Service :8003) sets `scheduled_at`; rate limit checked against Redis
3. **Enqueue** — Schedule Service cron (every 60s) finds due posts and publishes to RabbitMQ `publish_queue`
4. **Publish** — Publisher Worker consumes the message, calls each platform API independently; retries up to 3× with exponential backoff via dead-letter queue
5. **Analytics refresh** — Analytics Service cron (every 60 min) fetches metrics from platform APIs and updates `analytics_cache`
6. **Webhook delivery** — On `post.published` or `post.failed`, Publisher Worker calls registered webhooks with HMAC-SHA256 signed payloads

## API Routes Summary

| Path prefix | Service |
|---|---|
| `/auth/*`, `/users/*` | Auth Service :8001 |
| `/posts/*`, `/media/*`, `/ai/*`, `/webhooks/*` | Content Service :8002 |
| `/schedules/*` | Schedule Service :8003 |
| `/analytics/*` | Analytics Service :8004 |

The Vite dev server proxies all these paths automatically when running `npm run dev` in `frontend/`.
