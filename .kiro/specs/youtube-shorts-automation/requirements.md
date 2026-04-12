# Requirements Document

## Introduction

The YouTube Shorts Automation System is a new feature module integrated into the existing social media automation platform (SMAS). It enables users to automatically convert long-form YouTube videos into multiple optimized YouTube Shorts through AI-powered highlight detection, automated video processing, caption generation, and direct YouTube channel upload. The module runs as a dedicated microservice (`services/youtube-shorts`) alongside the existing SMAS services, shares the existing PostgreSQL database and Redis instance, and adds a new BullMQ-based job queue backed by Redis. A new frontend section (`/youtube-shorts`) is added to the existing React application.

## Glossary

- **YouTube_Shorts_Service**: The new Node.js/Express/TypeScript microservice that handles channel management, job orchestration, and clip management for YouTube Shorts automation.
- **VideoProcessor**: The FFmpeg-based component within YouTube_Shorts_Service responsible for transcription, cropping, scaling, and rendering video clips to 9:16 aspect ratio.
- **AIAnalyzer**: The component within YouTube_Shorts_Service that uses an LLM (OpenAI GPT-4 or Anthropic Claude) to analyze transcripts and identify viral-worthy clip segments.
- **YouTubeUploader**: The component within YouTube_Shorts_Service that manages YouTube OAuth2 flows and uploads Short clips via the YouTube Data API v3.
- **JobQueueService**: The BullMQ-based component within YouTube_Shorts_Service that enqueues, tracks, and processes video jobs using Redis as the queue backend.
- **VideoJob**: A database record representing a single long-form video processing request, from submission through clip generation.
- **ShortClip**: A database record representing one identified highlight segment extracted from a VideoJob.
- **ClipVariant**: A database record representing a rendered output variant of a ShortClip (e.g., with or without captions).
- **JobEvent**: A database record capturing a timestamped state transition or progress update for a VideoJob.
- **YouTubeChannel**: A database record representing a connected YouTube channel belonging to a user, storing OAuth2 credentials.
- **ProgressMonitor**: The frontend WebSocket-connected component that displays real-time job and upload progress to the user.
- **ClipEditor**: The frontend component that allows users to review, edit metadata, and trigger uploads for individual ShortClips.
- **User**: An authenticated SMAS platform user, identified by their existing `users` table record.

---

## Requirements

### Requirement 1: YouTube Channel Connection

**User Story:** As a user, I want to connect my YouTube channel to the platform, so that I can upload generated Shorts directly to my channel.

#### Acceptance Criteria

1. WHEN a user requests a YouTube OAuth2 authorization URL, THE YouTubeUploader SHALL generate and return a Google OAuth2 authorization URL scoped to `youtube.upload` and `youtube.readonly`.
2. WHEN Google redirects to the OAuth2 callback with a valid authorization code, THE YouTubeUploader SHALL exchange the code for access and refresh tokens and store them encrypted in the `YouTubeChannel` record associated with the authenticated user.
3. IF the OAuth2 callback receives an error parameter instead of a code, THEN THE YouTubeUploader SHALL return HTTP 400 with a descriptive error message.
4. WHEN a user requests disconnection of a YouTube channel, THE YouTube_Shorts_Service SHALL revoke the stored OAuth2 tokens and delete the `YouTubeChannel` record for that user.
5. WHEN a user requests their connected channel list, THE YouTube_Shorts_Service SHALL return all `YouTubeChannel` records belonging to that user including channel title, thumbnail URL, and current quota usage.
6. WHEN the YouTube Data API v3 quota for a connected channel reaches 90% of the daily limit, THE YouTubeUploader SHALL emit a `channel:quota_warning` WebSocket event to the owning user.
7. THE YouTube_Shorts_Service SHALL enforce one `YouTubeChannel` record per Google account per user, rejecting duplicate connections with HTTP 409.

---

### Requirement 2: Video Job Submission

**User Story:** As a user, I want to submit a YouTube video URL for processing, so that the system can automatically generate Shorts from it.

#### Acceptance Criteria

1. WHEN a user submits a valid YouTube video URL, THE YouTube_Shorts_Service SHALL create a `VideoJob` record with status `pending` and enqueue it in the JobQueueService, returning the job ID and initial status within 2 seconds.
2. IF a submitted URL does not match the YouTube video URL pattern (`youtube.com/watch?v=` or `youtu.be/`), THEN THE YouTube_Shorts_Service SHALL return HTTP 422 with `{ error: "invalid_youtube_url" }`.
3. IF a user submits a URL for a video that is private or unavailable, THEN THE YouTube_Shorts_Service SHALL update the `VideoJob` status to `failed` with error `video_unavailable` and emit a `job:failed` WebSocket event.
4. WHEN a user submits a job, THE YouTube_Shorts_Service SHALL accept an optional configuration object specifying: maximum number of clips (1–10, default 5), minimum clip duration in seconds (15–60, default 30), maximum clip duration in seconds (30–180, default 60), target YouTube channel ID, and whether to burn captions.
5. IF the requested maximum clip count is outside the range 1–10, THEN THE YouTube_Shorts_Service SHALL return HTTP 422 with `{ error: "invalid_clip_count", min: 1, max: 10 }`.
6. THE YouTube_Shorts_Service SHALL support concurrent job processing for multiple users without cross-user data access.
7. WHEN a user requests cancellation of a `VideoJob` with status `pending` or `processing`, THE YouTube_Shorts_Service SHALL update the job status to `cancelled`, remove it from the queue if not yet started, and emit a `job:failed` WebSocket event with reason `cancelled`.

---

### Requirement 3: Video Download and Transcription

**User Story:** As a user, I want the system to download and transcribe the source video, so that AI analysis can identify the best segments.

#### Acceptance Criteria

1. WHEN a `VideoJob` is dequeued, THE VideoProcessor SHALL download the source YouTube video to temporary local storage and update the `VideoJob` status to `processing`.
2. WHEN a video is downloaded, THE VideoProcessor SHALL generate a full transcript using Whisper, producing word-level timestamps for every spoken word in the video.
3. IF the video download fails due to a network error, THEN THE VideoProcessor SHALL retry the download up to 3 times with exponential backoff (5s, 10s, 20s) before marking the `VideoJob` as `failed`.
4. IF the video duration exceeds 3 hours, THEN THE VideoProcessor SHALL reject the job, update the `VideoJob` status to `failed` with error `video_too_long`, and emit a `job:failed` WebSocket event.
5. WHEN transcription is complete, THE VideoProcessor SHALL store the transcript with word-level timestamps in the `VideoJob` record and emit a `job:progress` WebSocket event with stage `transcription_complete` and percentage progress.
6. THE VideoProcessor SHALL delete all temporary local video files for a job upon job completion, failure, or cancellation.

---

### Requirement 4: AI-Powered Highlight Detection

**User Story:** As a user, I want the system to automatically identify the most engaging segments of my video, so that I get high-quality Shorts without manual review of the full video.

#### Acceptance Criteria

1. WHEN a transcript is available for a `VideoJob`, THE AIAnalyzer SHALL submit the transcript to the configured LLM (OpenAI GPT-4 or Anthropic Claude) to identify candidate clip segments, each with a start timestamp, end timestamp, title suggestion, description suggestion, and viral score (0.0–1.0).
2. THE AIAnalyzer SHALL return clip segments whose duration falls within the minimum and maximum clip duration specified in the job configuration.
3. THE AIAnalyzer SHALL return no more clip segments than the maximum clip count specified in the job configuration.
4. IF the LLM API call fails or times out after 30 seconds, THEN THE AIAnalyzer SHALL retry once before marking the `VideoJob` as `failed` with error `ai_analysis_failed` and emitting a `job:failed` WebSocket event.
5. WHEN AI analysis is complete, THE AIAnalyzer SHALL create one `ShortClip` record per identified segment and emit a `job:progress` WebSocket event with stage `analysis_complete` and percentage progress.
6. FOR ALL valid transcript inputs, THE AIAnalyzer SHALL produce clip segments where every segment's start timestamp is less than its end timestamp.

---

### Requirement 5: Video Processing and Clip Rendering

**User Story:** As a user, I want each identified clip to be automatically rendered as a vertical 9:16 Short, so that it is ready for YouTube upload without manual editing.

#### Acceptance Criteria

1. WHEN a `ShortClip` record is created, THE VideoProcessor SHALL extract the clip segment from the source video using FFmpeg and render it to 1080×1920 resolution at 9:16 aspect ratio.
2. THE VideoProcessor SHALL apply intelligent cropping to keep the primary subject centered in the frame when converting from widescreen to vertical format.
3. WHERE the job configuration specifies caption burning, THE VideoProcessor SHALL overlay animated word-highlight captions onto the rendered clip using the Whisper word-level timestamps.
4. WHEN a clip is rendered, THE VideoProcessor SHALL upload the rendered file to AWS S3 and create a `ClipVariant` record storing the S3 key, resolution, duration, and file size.
5. IF FFmpeg processing fails for a clip, THEN THE VideoProcessor SHALL mark that `ShortClip` as `failed` and continue processing remaining clips for the same job.
6. WHEN all clips for a `VideoJob` have been processed (rendered or failed), THE VideoProcessor SHALL update the `VideoJob` status to `completed` and emit a `job:completed` WebSocket event containing the count of successfully rendered clips.
7. THE VideoProcessor SHALL emit a `job:progress` WebSocket event after each clip render completes, reporting the number of clips rendered out of the total.

---

### Requirement 6: Caption Generation

**User Story:** As a user, I want accurate captions generated for each Short, so that my content is accessible and performs better on YouTube.

#### Acceptance Criteria

1. WHEN a `ShortClip` is rendered, THE VideoProcessor SHALL generate an SRT-format caption file from the Whisper word-level timestamps scoped to the clip's time range.
2. THE VideoProcessor SHALL store the SRT caption content in the `ShortClip` record.
3. WHERE the job configuration specifies caption burning, THE VideoProcessor SHALL embed the captions as a burned-in subtitle track in the rendered video file rather than as a separate sidecar file.
4. THE VideoProcessor SHALL produce caption text that matches the spoken words in the source transcript with no added or removed words.
5. FOR ALL ShortClip records with a non-null transcript segment, THE VideoProcessor SHALL produce a caption file where parsing the SRT then formatting it then parsing it again yields an equivalent caption structure (round-trip property).

---

### Requirement 7: Clip Review and Metadata Editing

**User Story:** As a user, I want to review and edit each generated clip's metadata before uploading, so that I can optimize titles and descriptions for my audience.

#### Acceptance Criteria

1. WHEN a `VideoJob` reaches `completed` status, THE YouTube_Shorts_Service SHALL make all associated `ShortClip` records available via the clips API with their AI-suggested title, description, viral score, duration, and thumbnail URL.
2. WHEN a user updates a `ShortClip`'s title or description, THE YouTube_Shorts_Service SHALL persist the changes and return the updated record.
3. IF a user submits a clip title exceeding 100 characters, THEN THE YouTube_Shorts_Service SHALL return HTTP 422 with `{ error: "title_too_long", max: 100 }`.
4. IF a user submits a clip description exceeding 5000 characters, THEN THE YouTube_Shorts_Service SHALL return HTTP 422 with `{ error: "description_too_long", max: 5000 }`.
5. WHEN a user requests clip regeneration for a `ShortClip`, THE YouTube_Shorts_Service SHALL re-enqueue the clip for re-rendering with updated parameters and update the clip status to `processing`.
6. THE YouTube_Shorts_Service SHALL allow a user to download the rendered clip file from S3 via a pre-signed URL valid for 1 hour.

---

### Requirement 8: YouTube Upload

**User Story:** As a user, I want to upload approved clips directly to my YouTube channel, so that I can publish Shorts without leaving the platform.

#### Acceptance Criteria

1. WHEN a user triggers upload for a `ShortClip`, THE YouTubeUploader SHALL upload the rendered video file from S3 to the target YouTube channel using the YouTube Data API v3, setting the title, description, category, and `#Shorts` hashtag.
2. WHEN an upload is initiated, THE YouTubeUploader SHALL emit `clip:upload_progress` WebSocket events at minimum every 10 seconds with bytes uploaded and total bytes.
3. WHEN an upload completes successfully, THE YouTubeUploader SHALL update the `ShortClip` record with the YouTube video ID and URL, set status to `uploaded`, and emit a `clip:uploaded` WebSocket event.
4. IF the YouTube Data API v3 returns a quota exceeded error, THEN THE YouTubeUploader SHALL update the `ShortClip` status to `upload_failed` with error `quota_exceeded`, emit a `channel:quota_warning` WebSocket event, and not retry until the next UTC day.
5. IF the upload fails for a reason other than quota exhaustion, THEN THE YouTubeUploader SHALL retry the upload up to 3 times with exponential backoff (30s, 60s, 120s) before setting the `ShortClip` status to `upload_failed`.
6. THE YouTubeUploader SHALL refresh the YouTube OAuth2 access token automatically when it is within 5 minutes of expiry before initiating an upload.
7. WHEN a user requests upload of a `ShortClip` whose `ClipVariant` does not exist in S3, THE YouTube_Shorts_Service SHALL return HTTP 404 with `{ error: "clip_not_rendered" }`.

---

### Requirement 9: Real-Time Progress Tracking

**User Story:** As a user, I want to see real-time progress updates for my jobs and uploads, so that I know the current state without refreshing the page.

#### Acceptance Criteria

1. THE YouTube_Shorts_Service SHALL maintain a WebSocket connection per authenticated user session using Socket.io, scoped to that user's jobs and clips only.
2. WHEN a `VideoJob` transitions between any two statuses, THE YouTube_Shorts_Service SHALL emit a `job:progress` WebSocket event to the owning user containing the job ID, new status, stage label, and integer percentage (0–100).
3. WHEN a `ShortClip` becomes available after rendering, THE YouTube_Shorts_Service SHALL emit a `job:clip_ready` WebSocket event to the owning user containing the clip ID, thumbnail URL, and viral score.
4. WHEN a `VideoJob` reaches `completed` status, THE YouTube_Shorts_Service SHALL emit a `job:completed` WebSocket event to the owning user containing the job ID and array of clip IDs.
5. WHEN a `VideoJob` reaches `failed` status, THE YouTube_Shorts_Service SHALL emit a `job:failed` WebSocket event to the owning user containing the job ID and error reason string.
6. THE YouTube_Shorts_Service SHALL authenticate WebSocket connections using the same JWT access token used for REST API requests, rejecting unauthenticated connections with a `401` disconnect event.

---

### Requirement 10: Job History and Management

**User Story:** As a user, I want to view and manage my past and active jobs, so that I can track what has been processed and clean up old data.

#### Acceptance Criteria

1. WHEN a user requests their job list, THE YouTube_Shorts_Service SHALL return all `VideoJob` records belonging to that user, ordered by creation date descending, with pagination support (page size 20, cursor-based).
2. WHEN a user requests a specific job by ID, THE YouTube_Shorts_Service SHALL return the `VideoJob` record with its associated `ShortClip` records and the latest `JobEvent` entries.
3. IF a user requests a job that belongs to a different user, THEN THE YouTube_Shorts_Service SHALL return HTTP 404.
4. WHEN a user deletes a `VideoJob`, THE YouTube_Shorts_Service SHALL cascade-delete all associated `ShortClip`, `ClipVariant`, and `JobEvent` records and remove all associated S3 objects.
5. IF a user attempts to delete a `VideoJob` with status `processing`, THEN THE YouTube_Shorts_Service SHALL return HTTP 409 with `{ error: "job_in_progress" }`.
6. THE YouTube_Shorts_Service SHALL retain `JobEvent` records for completed or failed jobs for a minimum of 30 days before they are eligible for deletion.

---

### Requirement 11: Multi-Tenancy and Data Isolation

**User Story:** As a platform operator, I want each user's data to be fully isolated, so that users cannot access each other's jobs, clips, or channel credentials.

#### Acceptance Criteria

1. THE YouTube_Shorts_Service SHALL scope all database queries for `VideoJob`, `ShortClip`, `ClipVariant`, `YouTubeChannel`, and `JobEvent` records to the authenticated user's ID.
2. THE YouTube_Shorts_Service SHALL store YouTube OAuth2 access tokens and refresh tokens encrypted at rest using AES-256-GCM with a per-record initialization vector.
3. THE YouTube_Shorts_Service SHALL store all rendered clip files in S3 under a key prefix namespaced by user ID (`{userId}/{jobId}/{clipId}/`).
4. IF an authenticated request attempts to access a resource belonging to a different user, THEN THE YouTube_Shorts_Service SHALL return HTTP 404 rather than HTTP 403 to avoid confirming resource existence.
5. THE YouTube_Shorts_Service SHALL use the existing SMAS JWT authentication middleware to validate all REST and WebSocket requests.

---

### Requirement 12: Integration with Existing SMAS Platform

**User Story:** As a platform operator, I want the YouTube Shorts module to integrate cleanly with the existing SMAS infrastructure, so that I can operate it without duplicating shared resources.

#### Acceptance Criteria

1. THE YouTube_Shorts_Service SHALL connect to the existing shared PostgreSQL 15 database using the Prisma ORM and the shared `DATABASE_URL` environment variable.
2. THE YouTube_Shorts_Service SHALL connect to the existing shared Redis 7 instance for BullMQ job queues and WebSocket adapter using the shared `REDIS_URL` environment variable.
3. THE YouTube_Shorts_Service SHALL be registered as a new upstream in the existing Nginx configuration, routing `/api/youtube-shorts/` requests to the service.
4. THE YouTube_Shorts_Service SHALL expose a `GET /health` endpoint returning HTTP 200 with `{ status: "ok" }` for use by Docker health checks.
5. WHEN the YouTube_Shorts_Service starts, THE YouTube_Shorts_Service SHALL apply any pending Prisma migrations before accepting requests.
6. THE YouTube_Shorts_Service SHALL emit structured JSON logs compatible with the existing platform log format, including `service`, `level`, `message`, and `timestamp` fields.
