# Implementation Plan: Social Media Automation System (SMAS)

## Overview

Implement SMAS as four Fastify (Node.js/TypeScript) microservices (Auth, Content, Schedule, Analytics), a Publisher Worker, React 19/TypeScript frontend, and shared infrastructure. Tasks are ordered to build foundational layers first, then wire services together incrementally.

## Tasks

- [x] 1. Project scaffolding and shared infrastructure
  - Create monorepo directory structure: `services/auth`, `services/content`, `services/schedule`, `services/analytics`, `workers/publisher`, `frontend/`, `infra/`
  - Write `docker-compose.yml` with PostgreSQL, Redis, RabbitMQ, and MinIO containers
  - Write Prisma schema covering all tables from the design and generate the initial migration
  - Create shared TypeScript package `smas-shared` with common types, JWT utilities, Prisma client export, and Redis client factory
  - _Requirements: 1.1, 4.1, 6.1_

- [x] 2. Auth_Service — authentication core
  - [x] 2.1 Implement `POST /auth/login` — validate credentials, issue JWT access token and refresh token; store refresh token hash in Redis and `refresh_tokens` table
    - Access token: short-lived JWT (15 min); refresh token: long-lived (7 days)
    - Return `{ access_token, refresh_token }`
    - _Requirements: 1.1, 1.2_

  - [ ]* 2.2 Write property test for JWT issuance and invalid credential rejection
    - **Property 1: JWT issuance on valid credentials**
    - **Property 2: Rejection on invalid credentials**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 2.3 Implement `POST /auth/refresh` and `POST /auth/logout`
    - Refresh: validate refresh token, issue new access token, rotate refresh token
    - Logout: revoke refresh token in Redis and DB
    - _Requirements: 1.3_

  - [ ]* 2.4 Write property test for refresh token round trip
    - **Property 3: Refresh token round trip**
    - **Validates: Requirements 1.3**

  - [x] 2.5 Implement RBAC middleware — JWT validation dependency, role permission map, enforce on all protected routes
    - Roles: `admin`, `editor`, `viewer` with distinct permission sets
    - Return HTTP 401 for missing/invalid token; HTTP 403 for insufficient role
    - _Requirements: 1.4, 1.5, 9.1_

  - [ ]* 2.6 Write property test for RBAC enforcement
    - **Property 4: RBAC enforcement**
    - **Validates: Requirements 1.4, 1.5**

  - [x] 2.7 Implement audit log middleware — record every CUD operation to `audit_logs` (user ID, action type, resource type, resource ID, timestamp UTC, IP address)
    - `audit_logs` table must be append-only; no UPDATE/DELETE granted to app role
    - Expose `GET /audit-logs` (Admin only) with filters: user_id, resource_type, action_type, time range
    - _Requirements: 1.6, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 2.8 Write property tests for audit log completeness and append-only invariant
    - **Property 5: Audit log completeness**
    - **Property 21: Audit log append-only invariant**
    - **Validates: Requirements 1.6, 12.1, 12.2, 12.5**

- [x] 3. Auth_Service — OAuth platform connections
  - [x] 3.1 Implement `GET /auth/oauth/{platform}/start` and `GET /auth/oauth/{platform}/callback`
    - Supported platforms: `twitter`, `linkedin`, `facebook`, `instagram`
    - On callback: store encrypted access/refresh tokens and expiry in `platform_connections`
    - Reject Instagram Personal accounts (HTTP 400 `instagram_business_required`)
    - Reject LinkedIn Personal profiles (HTTP 400 `linkedin_company_page_required`)
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7_

  - [x] 3.2 Implement `POST /auth/oauth/{platform}/refresh` — auto-refresh platform tokens within 24 hours of expiry; mark connection `invalid` and notify user on failure
    - _Requirements: 2.3, 2.4_

- [x] 4. Checkpoint — Auth_Service complete
  - Ensure all Auth_Service tests pass, ask the user if questions arise.

- [x] 5. Content_Service — post CRUD and platform posts
  - [x] 5.1 Implement `POST /posts` — create Post with body, target platforms, optional media, optional schedule; create one `platform_posts` record per target platform with status `pending`; validate character limits per platform
    - Platform limits: Twitter 280, LinkedIn 3000, Facebook 63206, Instagram 2200
    - Return HTTP 422 with `{ error: "character_limit_exceeded", platform, limit, actual }` on violation
    - _Requirements: 4.1, 4.2, 4.7_

  - [ ]* 5.2 Write property tests for Platform_Post creation and character limit enforcement
    - **Property 6: Platform_Post creation on post creation**
    - **Property 9: Platform character limit enforcement**
    - **Validates: Requirements 4.2, 4.7**

  - [x] 5.3 Implement `GET /posts/{id}`, `PUT /posts/{id}`, `DELETE /posts/{id}`
    - PUT: reject with HTTP 409 if any Platform_Post has status `published`
    - DELETE: reject with HTTP 409 if post status is `published`; on success, cascade-delete Platform_Posts and Schedules
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

  - [ ]* 5.4 Write property tests for published post update and deletion rejection
    - **Property 7: Published post update rejection**
    - **Property 8: Published post deletion rejection**
    - **Validates: Requirements 4.4, 4.6**

- [x] 6. Content_Service — media management
  - [x] 6.1 Implement `POST /media/upload` in Media_Manager
    - Accept JPEG, PNG, GIF, WebP (images) and MP4, MOV (video, max 512 MB)
    - Reject oversized video with HTTP 413; reject unsupported format with HTTP 415
    - Store file in S3/MinIO, record CDN URL in `media` table
    - Generate thumbnail for images and preview frame for videos
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 6.2 Write property tests for media upload round trip, oversized video rejection, and unsupported format rejection
    - **Property 10: Media upload round trip**
    - **Property 11: Oversized video rejection**
    - **Property 12: Unsupported format rejection**
    - **Validates: Requirements 5.1, 5.4, 5.5**

  - [x] 6.3 Implement `DELETE /media/{id}` — remove file from S3/MinIO when media is exclusively associated with a deleted post
    - _Requirements: 5.7_

- [x] 7. Content_Service — AI generation
  - [x] 7.1 Implement `POST /ai/generate` using LangChain abstraction
    - Accept `{ topic, platform, model }` where model ∈ {`gpt-4`, `claude`, `llama`}
    - Return draft formatted to platform character constraints
    - Timeout: 10 seconds; return HTTP 503 `{ error: "ai_backend_unavailable", backend }` on failure
    - Store draft as Post with status `draft`; preserve original AI text in `original_ai_body` on edit
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 8. Content_Service — approval workflow
  - [x] 8.1 Implement `POST /posts/{id}/submit-approval`, `POST /posts/{id}/approve`, `POST /posts/{id}/reject`
    - `submit-approval`: transition post to `pending_approval`; notify all team Admins
    - `approve` (Admin only): transition to `approved`
    - `reject` (Admin only): transition to `rejected`; notify submitting Editor with reason
    - Block Editor from editing post body while status is `pending_approval` (HTTP 409 `post_pending_approval`)
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 8.2 Write property test for approval gate enforcement and pending approval edit lock
    - **Property 16: Approval gate enforcement**
    - **Property 17: Pending approval edit lock**
    - **Validates: Requirements 9.2, 9.6**

- [x] 9. Checkpoint — Content_Service complete
  - Ensure all Content_Service tests pass, ask the user if questions arise.

- [x] 10. Schedule_Service — scheduling and rate limiting
  - [x] 10.1 Implement `POST /schedules`, `DELETE /schedules/{id}`, `GET /schedules/{post_id}`
    - Store `scheduled_at` with IANA timezone in `schedules` table
    - DELETE: remove schedule, revert post status to `draft`
    - _Requirements: 6.1, 6.4, 6.5_

  - [x] 10.2 Implement cron job (60-second interval) to evaluate pending schedules and enqueue due posts to RabbitMQ `publish_queue`
    - Only enqueue posts with status `approved` (or `scheduled` when approval workflow is disabled)
    - _Requirements: 6.2, 6.3, 9.2_

  - [x] 10.3 Implement rate limiting using Redis atomic increments
    - Key: `rate_limit:{platform_connection_id}:{YYYY-MM-DD}` with TTL until UTC midnight
    - Reject publish attempt at count 50 with HTTP 429 `{ error: "rate_limit_exceeded", resets_at }`
    - Notify user and retain post in `scheduled` status when rate limit would be exceeded
    - Reset counter at UTC midnight
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 10.4 Write property tests for rate limit enforcement and reset
    - **Property 13: Rate limit enforcement**
    - **Property 14: Rate limit reset at UTC midnight**
    - **Validates: Requirements 7.2, 7.3**

- [x] 11. Publisher_Worker
  - [x] 11.1 Implement RabbitMQ consumer that fetches Post and Platform_Posts from DB and dispatches to each target platform API
    - Twitter: Twitter API v2
    - LinkedIn: LinkedIn Marketing API
    - Facebook: Meta Graph API
    - Instagram: Meta Graph API
    - On success: update Platform_Post status to `published`, record `platform_post_id` and `published_at`
    - On failure: update Platform_Post status to `failed`, record `error_message`; failure on one platform must not block others
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 11.2 Write property test for independent platform failure isolation
    - **Property 15: Independent platform failure isolation**
    - **Validates: Requirements 8.3**

  - [x] 11.3 Implement retry logic via RabbitMQ dead-letter queue — exponential backoff, up to 3 retries; mark Platform_Post `failed` after exhausting retries
    - _Requirements: 6.6_

- [x] 12. Checkpoint — Schedule_Service and Publisher_Worker complete
  - Ensure all scheduling, rate limiting, and publishing tests pass, ask the user if questions arise.

- [x] 13. Analytics_Service
  - [x] 13.1 Implement `GET /analytics/posts/{id}` and `GET /analytics/posts/{id}/platforms`
    - Return most recently cached metrics from `analytics_cache` within 200ms
    - Aggregate across all platforms for the post-level endpoint
    - _Requirements: 10.1, 10.3, 10.4_

  - [ ]* 13.2 Write property test for analytics cache response time
    - **Property 18: Analytics cache response time**
    - **Validates: Requirements 10.3**

  - [x] 13.3 Implement cron job (60-minute interval) to refresh `analytics_cache` from Platform APIs
    - On Platform API rate limit: retain cached metrics, log failure, no user-facing error
    - _Requirements: 10.2, 10.5_

- [x] 14. Webhook Dispatcher
  - [x] 14.1 Implement webhook registration: allow users to register webhook URLs with subscribed event types from `{ post.published, post.failed, post.approved, post.rejected, platform_connection.expired }`
    - Store in `webhooks` table with per-webhook HMAC secret
    - _Requirements: 11.1, 11.6_

  - [x] 14.2 Implement webhook delivery — on subscribed event, send HTTP POST within 5 seconds with JSON payload signed via HMAC-SHA256 in `X-SMAS-Signature` header
    - Retry up to 3 times with exponential backoff (1s, 2s, 4s) on non-2xx or timeout
    - Record each attempt in `webhook_deliveries`
    - _Requirements: 11.2, 11.3, 11.4_

  - [ ]* 14.3 Write property tests for webhook HMAC signature validity and auto-disable after consecutive failures
    - **Property 19: Webhook HMAC signature validity**
    - **Property 20: Webhook auto-disable after consecutive failures**
    - **Validates: Requirements 11.4, 11.5**

  - [x] 14.4 Implement auto-disable logic — after 10 consecutive non-2xx responses, set `enabled = false` and notify the registering user
    - _Requirements: 11.5_

- [x] 15. React/TypeScript frontend
  - [x] 15.1 Scaffold React/TypeScript app with routing; implement login page calling `POST /auth/login` and storing tokens
    - _Requirements: 1.1_

  - [x] 15.2 Implement post composer UI — body editor with per-platform character count, platform selector, media upload, AI generate button
    - _Requirements: 3.1, 4.1, 5.1_

  - [x] 15.3 Implement scheduling UI — date/time picker with timezone selector (IANA), schedule creation and cancellation
    - _Requirements: 6.1, 6.4, 6.5_

  - [x] 15.4 Implement approval workflow UI — submit for approval, approve/reject actions (Admin), rejection reason input
    - _Requirements: 9.3, 9.4, 9.5_

  - [x] 15.5 Implement analytics dashboard — per-post metrics display, aggregated view across platforms
    - _Requirements: 10.3, 10.4_

  - [x] 15.6 Implement platform connections UI — OAuth connect/disconnect flow for all four platforms
    - _Requirements: 2.1, 2.5_

  - [x] 15.7 Implement webhook management UI — register, list, and delete webhooks; display delivery history
    - _Requirements: 11.1_

  - [x] 15.8 Implement audit log viewer (Admin only) — filterable table by user, resource type, action, and time range
    - _Requirements: 12.4_

- [x] 16. Final checkpoint — full system integration
  - Wire all services through the API Gateway (Nginx) configuration
  - Verify end-to-end flow: create post → schedule → enqueue → publish → analytics refresh → webhook delivery
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with minimum 100 runs; each must include the comment tag `// Feature: social-media-automation-system, Property {N}: {property_text}`
- Mock all external Platform APIs using `msw` or `nock` in tests
- Use `ioredis-mock` for Redis and an in-process RabbitMQ mock for queue tests
- Use a dedicated test PostgreSQL database with Prisma migrations applied
