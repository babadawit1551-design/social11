# Implementation Plan: YouTube Shorts Automation

## Overview

Implement the `services/youtube-shorts` microservice and its frontend section as a series of incremental steps, each building on the last. The service uses Express + TypeScript, BullMQ on Redis, Prisma (shared DB), Socket.io, FFmpeg, Whisper, and the YouTube Data API v3.

## Tasks

- [x] 1. Extend shared Prisma schema with new models
  - Add `YouTubeChannel`, `VideoJob`, `ShortClip`, `ClipVariant`, `JobEvent` models to `shared/prisma/schema.prisma`
  - Add `VideoJobStatus` and `ShortClipStatus` enums
  - Add `youtubeChannels`, `videoJobs`, `shortClips` relations to the existing `User` model
  - Run `prisma generate` to regenerate the client
  - _Requirements: 1.2, 2.1, 3.1, 5.4, 10.1, 11.1, 12.1_

- [x] 2. Scaffold the `services/youtube-shorts` service
  - [x] 2.1 Create service directory structure and `package.json`
    - Mirror the layout of `services/schedule`: `src/index.ts`, `src/config.ts`, `src/routes/`, `src/lib/`, `src/workers/`, `src/middleware/`
    - Add dependencies: `express`, `socket.io`, `@socket.io/redis-adapter`, `bullmq`, `googleapis`, `openai`, `@anthropic-ai/sdk`, `fluent-ffmpeg`, `whisper-node`, `ytdl-core`, `aws-sdk`, `zod`, `smas-shared`
    - Add `tsconfig.json` extending `tsconfig.base.json`
    - _Requirements: 12.1, 12.2_

  - [x] 2.2 Implement `src/config.ts`
    - Read and validate env vars: `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CDN_BASE_URL`, `PORT` (default 8005)
    - _Requirements: 12.1, 12.2_

  - [x] 2.3 Implement JWT auth middleware `src/middleware/auth.ts`
    - Reuse the same JWT validation pattern as `services/schedule/src/middleware/auth.ts`
    - Attach `req.userId` for downstream handlers
    - _Requirements: 11.5_

- [x] 3. Implement crypto utility and queue service
  - [x] 3.1 Implement `src/lib/crypto.ts`
    - AES-256-GCM `encrypt(plaintext, key)` and `decrypt(encrypted, key)` functions
    - Each call generates a unique random IV; return `{ iv, ciphertext, authTag }` as hex strings
    - _Requirements: 1.2, 11.2_

  - [ ]* 3.2 Write property test for crypto round-trip
    - **Property 1: Encrypt-then-decrypt round-trip**
    - **Validates: Requirements 11.2**

  - [x] 3.3 Implement `src/lib/queue.ts` (JobQueueService)
    - Create BullMQ `Queue` instances: `yt-video-jobs` and `yt-clip-uploads`
    - Export `enqueueVideoJob(jobId)` and `enqueueClipUpload(clipId)` helpers
    - Connect to Redis via `REDIS_URL`
    - _Requirements: 2.1, 12.2_

- [x] 4. Implement Socket.io gateway
  - [x] 4.1 Implement `src/lib/socketGateway.ts`
    - Initialise Socket.io server with `@socket.io/redis-adapter`
    - Authenticate connections via JWT middleware; reject unauthenticated with `401` disconnect
    - Join each socket to a room named by `userId`
    - Export `emitToUser(userId, event, payload)` helper used by workers and route handlers
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 5. Implement YouTube channel management
  - [x] 5.1 Implement `src/lib/youtubeUploader.ts` — OAuth2 flow
    - `generateAuthUrl()` → Google OAuth2 URL scoped to `youtube.upload` and `youtube.readonly`
    - `exchangeCode(code)` → exchange auth code for tokens, encrypt and persist to `YouTubeChannel`
    - `refreshTokenIfNeeded(channel)` → refresh access token when within 5 minutes of expiry, re-encrypt and persist
    - _Requirements: 1.1, 1.2, 1.3, 8.6_

  - [x] 5.2 Implement channel routes `src/routes/channels.ts`
    - `POST /api/youtube-shorts/channels/connect` → return OAuth2 URL (req 1.1)
    - `GET  /api/youtube-shorts/channels/callback` → exchange code, store channel; HTTP 400 on error param (req 1.3); HTTP 409 on duplicate (req 1.7)
    - `GET  /api/youtube-shorts/channels` → list user's channels with title, thumbnail, quota (req 1.5)
    - `DELETE /api/youtube-shorts/channels/:channelId` → revoke tokens, delete record (req 1.4)
    - All routes require auth middleware; scope queries to `req.userId`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 11.1, 11.4_

  - [ ]* 5.3 Write unit tests for channel routes
    - Test OAuth callback error path (HTTP 400)
    - Test duplicate channel rejection (HTTP 409)
    - Test 404 on cross-user channel access
    - _Requirements: 1.3, 1.7, 11.4_

- [x] 6. Implement job submission and management routes
  - [x] 6.1 Implement `src/routes/jobs.ts`
    - `POST /api/youtube-shorts/jobs` — validate URL pattern, validate config ranges, create `VideoJob`, enqueue; HTTP 422 on invalid URL (req 2.2) or invalid clip count (req 2.5); return job ID within 2 s (req 2.1)
    - `GET  /api/youtube-shorts/jobs` — paginated list (cursor-based, page size 20) scoped to user (req 10.1)
    - `GET  /api/youtube-shorts/jobs/:jobId` — return job + clips + latest events; HTTP 404 on cross-user (req 10.2, 10.3)
    - `DELETE /api/youtube-shorts/jobs/:jobId` — cascade delete DB records + S3 objects; HTTP 409 if status is `processing` (req 10.4, 10.5)
    - `POST /api/youtube-shorts/jobs/:jobId/cancel` — cancel pending/processing job, emit `job:failed` with reason `cancelled` (req 2.7)
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.4_

  - [ ]* 6.2 Write unit tests for job submission validation
    - Test invalid URL returns HTTP 422 with `invalid_youtube_url`
    - Test clip count out of range returns HTTP 422 with `invalid_clip_count`
    - Test cross-user job access returns HTTP 404
    - Test delete of processing job returns HTTP 409
    - _Requirements: 2.2, 2.5, 10.3, 10.5_

- [x] 7. Implement clip management routes
  - [x] 7.1 Implement `src/routes/clips.ts`
    - `GET  /api/youtube-shorts/clips/:clipId` — return clip with variants; HTTP 404 on cross-user
    - `PATCH /api/youtube-shorts/clips/:clipId` — update title/description; HTTP 422 if title > 100 chars or description > 5000 chars (req 7.3, 7.4)
    - `GET  /api/youtube-shorts/clips/:clipId/download` — generate pre-signed S3 URL valid 1 hour (req 7.6)
    - `POST /api/youtube-shorts/clips/:clipId/upload` — enqueue clip upload; HTTP 404 with `clip_not_rendered` if no `ClipVariant` exists (req 8.7)
    - `POST /api/youtube-shorts/clips/:clipId/regenerate` — re-enqueue clip for re-render, set status to `processing` (req 7.5)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.7, 11.1, 11.4_

  - [ ]* 7.2 Write unit tests for clip metadata validation
    - Test title > 100 chars returns HTTP 422
    - Test description > 5000 chars returns HTTP 422
    - Test upload with no rendered variant returns HTTP 404 `clip_not_rendered`
    - _Requirements: 7.3, 7.4, 8.7_

- [x] 8. Checkpoint — wire up Express server and health endpoint
  - Implement `src/index.ts`: create Express app, register auth middleware, mount all route handlers, attach Socket.io gateway, start BullMQ workers, run Prisma migrations on startup
  - Implement `GET /health` returning `{ status: "ok" }` (req 12.4)
  - Add structured JSON logger emitting `{ service, level, message, timestamp }` (req 12.6)
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 12.4, 12.5, 12.6_

- [x] 9. Implement VideoProcessor worker — download and transcription
  - [x] 9.1 Implement download and duration check in `src/workers/videoProcessor.ts`
    - BullMQ worker consuming `yt-video-jobs`
    - Download source video via `ytdl-core` to a temp directory; update `VideoJob` status to `processing`
    - Validate duration ≤ 3 hours; if exceeded, set status `failed` with `video_too_long`, emit `job:failed` (req 3.4)
    - Retry download up to 3 times with exponential backoff (5 s, 10 s, 20 s) on network error (req 3.3)
    - Handle private/unavailable video: set status `failed` with `video_unavailable`, emit `job:failed` (req 2.3)
    - _Requirements: 2.3, 3.1, 3.3, 3.4_

  - [x] 9.2 Implement transcription step in `src/workers/videoProcessor.ts`
    - Run `whisper-node` on the downloaded file to produce word-level timestamps
    - Store transcript JSON in `VideoJob.transcript`
    - Emit `job:progress` with stage `transcription_complete` and percentage (req 3.5)
    - _Requirements: 3.2, 3.5_

  - [ ]* 9.3 Write unit tests for VideoProcessor download/transcription
    - Test retry logic fires 3 times then marks job failed
    - Test duration > 3 h marks job failed with `video_too_long`
    - _Requirements: 3.3, 3.4_

- [x] 10. Implement AIAnalyzer
  - [x] 10.1 Implement `src/lib/aiAnalyzer.ts`
    - Accept transcript + job config, call OpenAI GPT-4 (primary) or Anthropic Claude (fallback)
    - Return `ClipSegment[]` with `startSeconds`, `endSeconds`, `title`, `description`, `viralScore`
    - Validate each segment duration is within `[minClipDuration, maxClipDuration]`
    - Validate segment count ≤ `maxClips`
    - Retry once on LLM timeout (30 s); on second failure mark job `failed` with `ai_analysis_failed`, emit `job:failed` (req 4.4)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 10.2 Write property test for AIAnalyzer segment ordering
    - **Property 2: Every returned segment has startSeconds < endSeconds**
    - **Validates: Requirements 4.6**

  - [x] 10.3 Wire AIAnalyzer into VideoProcessor
    - After transcription, call AIAnalyzer; create one `ShortClip` record per segment
    - Emit `job:progress` with stage `analysis_complete` (req 4.5)
    - _Requirements: 4.5, 9.2_

- [x] 11. Implement clip rendering pipeline
  - [x] 11.1 Implement FFmpeg rendering in `src/workers/videoProcessor.ts`
    - For each `ShortClip`: extract segment, crop/scale to 1080×1920 (9:16), apply intelligent center-crop (req 5.2)
    - Where `burnCaptions` is true, overlay animated word-highlight captions using Whisper timestamps (req 5.3)
    - Upload rendered file to S3 under `{userId}/{jobId}/{clipId}/clip.mp4`; create `ClipVariant` record (req 5.4)
    - On FFmpeg failure for a clip: mark that `ShortClip` as `failed`, continue remaining clips (req 5.5)
    - Emit `job:progress` after each clip render (req 5.7); emit `job:clip_ready` with thumbnail URL and viral score (req 9.3)
    - When all clips processed: update `VideoJob` to `completed`, emit `job:completed` (req 5.6, 9.4)
    - Delete all temp files on completion, failure, or cancellation (req 3.6)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 3.6, 9.3, 9.4_

  - [ ]* 11.2 Write unit tests for clip rendering error isolation
    - Test that FFmpeg failure on one clip does not prevent other clips from rendering
    - Test that temp files are deleted after job completion and failure
    - _Requirements: 5.5, 3.6_

- [x] 12. Implement caption generation
  - [x] 12.1 Implement SRT generation in `src/workers/videoProcessor.ts`
    - After rendering each clip, generate SRT content from Whisper word-level timestamps scoped to the clip's time range
    - Store SRT in `ShortClip.srtContent` (req 6.1, 6.2)
    - Ensure caption text matches spoken words exactly — no added or removed words (req 6.4)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 12.2 Write property test for SRT round-trip
    - **Property 3: Parse → format → parse SRT yields equivalent caption structure**
    - **Validates: Requirements 6.5**

- [x] 13. Implement YouTubeUploader — upload worker
  - [x] 13.1 Implement upload logic in `src/lib/youtubeUploader.ts`
    - BullMQ worker consuming `yt-clip-uploads`
    - Refresh OAuth token if within 5 minutes of expiry before upload (req 8.6)
    - Stream clip file from S3 to YouTube Data API v3; set title, description, category, `#Shorts` hashtag (req 8.1)
    - Emit `clip:upload_progress` at minimum every 10 seconds (req 8.2)
    - On success: update `ShortClip` with `youtubeVideoId`, `youtubeUrl`, status `uploaded`; emit `clip:uploaded` (req 8.3)
    - On quota exceeded: set status `upload_failed` with `quota_exceeded`, emit `channel:quota_warning`, do not retry (req 8.4)
    - On other failure: retry up to 3 times with backoff (30 s, 60 s, 120 s); then set status `upload_failed` (req 8.5)
    - Emit `channel:quota_warning` when quota reaches 90% of daily limit (req 1.6)
    - _Requirements: 1.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 13.2 Write unit tests for YouTubeUploader retry and quota logic
    - Test quota exceeded sets status `upload_failed` and does not retry
    - Test non-quota failure retries 3 times then sets `upload_failed`
    - Test token refresh fires when token is within 5 minutes of expiry
    - _Requirements: 8.4, 8.5, 8.6_

- [x] 14. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Update Nginx and Docker Compose
  - [x] 15.1 Add `youtube_shorts_service` upstream and `/api/youtube-shorts/` location block to `infra/nginx.conf`
    - Include WebSocket upgrade headers (`Upgrade`, `Connection`) for Socket.io
    - _Requirements: 12.3_

  - [x] 15.2 Add `youtube_shorts_service` service to `docker-compose.yml`
    - Port 8005, env vars: `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CDN_BASE_URL`
    - `depends_on` postgres, redis
    - Add `Dockerfile` for the service
    - _Requirements: 12.1, 12.2, 12.4_

- [x] 16. Implement frontend YouTube Shorts section
  - [x] 16.1 Create `frontend/src/pages/YouTubeShortsPage.tsx`
    - Job submission form: YouTube URL input, config options (max clips, duration range, caption toggle, channel selector)
    - Job list with status badges and creation timestamps
    - _Requirements: 2.1, 2.4, 10.1_

  - [x] 16.2 Create `frontend/src/pages/YouTubeShortsJobPage.tsx`
    - Real-time progress display using Socket.io (`job:progress`, `job:clip_ready`, `job:completed`, `job:failed`)
    - Clip grid showing thumbnail, viral score, title, description, duration
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 16.3 Create clip editor component `frontend/src/components/ClipEditor.tsx`
    - Inline title/description editing with character-count validation (100 / 5000)
    - Download button (pre-signed URL), Upload to YouTube button, Regenerate button
    - Upload progress bar driven by `clip:upload_progress` Socket.io events
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.2_

  - [x] 16.4 Create channel connection component `frontend/src/components/YouTubeChannelConnect.tsx`
    - List connected channels with quota usage indicator
    - "Connect YouTube Channel" button that opens the OAuth2 URL
    - Quota warning banner driven by `channel:quota_warning` Socket.io event
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

  - [x] 16.5 Register routes in `frontend/src/App.tsx`
    - Add `/youtube-shorts` → `YouTubeShortsPage`
    - Add `/youtube-shorts/:jobId` → `YouTubeShortsJobPage`
    - _Requirements: 2.1, 10.1_

- [x] 17. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
