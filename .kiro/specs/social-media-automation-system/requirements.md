# Requirements Document

## Introduction

The Social Media Automation System (SMAS) is an enterprise-grade platform that streamlines content creation, scheduling, and distribution across multiple social media platforms (X/Twitter, LinkedIn, Facebook Pages, Instagram Business). It provides AI-assisted content generation, media management, team collaboration with approval workflows, analytics aggregation, and webhook integration — all built on a microservices architecture using Fastify (Node.js/TypeScript), React 19/TypeScript, PostgreSQL, Redis, and RabbitMQ.

## Glossary

- **SMAS**: Social Media Automation System — the platform described in this document
- **Platform**: An external social media service (X/Twitter, LinkedIn, Facebook Pages, Instagram Business)
- **Platform_Connection**: A verified OAuth link between a SMAS user/team and a Platform account
- **Post**: A unit of content created in SMAS intended for publication to one or more Platforms
- **Platform_Post**: The per-platform representation of a Post, tracking its publication state on a specific Platform
- **Schedule**: A time-based rule that triggers publication of a Post
- **Publisher_Worker**: The background service responsible for dispatching Posts to Platforms
- **Auth_Service**: The microservice (port 8001) responsible for authentication and authorization
- **Content_Service**: The microservice (port 8002) responsible for post and media management
- **Schedule_Service**: The microservice (port 8003) responsible for scheduling and queue management
- **Analytics_Service**: The microservice (port 8004) responsible for aggregating engagement metrics
- **AI_Generator**: The LangChain-based component that produces draft content using GPT-4, Claude, or Llama
- **Media_Manager**: The component responsible for uploading, storing, and optimizing images and videos
- **Approval_Workflow**: The process by which team members review and approve Posts before publication
- **Webhook**: An HTTP callback sent to an external system when a SMAS event occurs
- **Role**: A named permission level assigned to a team member (e.g., Admin, Editor, Viewer)
- **CDN**: Content Delivery Network used to serve optimized media assets
- **Rate_Limit**: The maximum number of Posts allowed per Platform per day (50 posts/day/platform)

---

## Requirements

### Requirement 1: User Authentication and Authorization

**User Story:** As a team member, I want to securely log in and have my permissions enforced, so that only authorized users can access and modify content.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE Auth_Service SHALL issue a signed JWT access token and a refresh token.
2. WHEN a user submits invalid credentials, THE Auth_Service SHALL return an HTTP 401 response with a descriptive error message.
3. WHEN an access token expires, THE Auth_Service SHALL accept a valid refresh token and issue a new access token without requiring re-login.
4. WHEN an access token is absent or invalid on a protected endpoint, THE Auth_Service SHALL return an HTTP 401 response.
5. THE Auth_Service SHALL enforce Role-based access control, permitting actions only to users whose Role grants the required permission.
6. WHEN a user action is performed, THE Auth_Service SHALL record an entry in the audit_logs table including the user ID, action type, timestamp, and affected resource ID.

---

### Requirement 2: Platform Connection Management

**User Story:** As a user, I want to connect my social media accounts via OAuth, so that SMAS can publish content on my behalf.

#### Acceptance Criteria

1. WHEN a user initiates an OAuth flow for a supported Platform, THE Auth_Service SHALL redirect the user to the Platform's authorization URL with the required scopes.
2. WHEN the Platform returns a valid OAuth callback, THE Auth_Service SHALL store the access token, refresh token, and expiry in the platform_connections table.
3. WHEN a Platform access token is within 24 hours of expiry, THE Auth_Service SHALL automatically refresh it using the stored refresh token.
4. IF a Platform OAuth refresh fails, THEN THE Auth_Service SHALL mark the Platform_Connection as invalid and notify the owning user.
5. THE SMAS SHALL support connections to X/Twitter, LinkedIn Company Pages, Facebook Pages, and Instagram Business accounts.
6. IF a user attempts to connect an Instagram Personal account, THEN THE Auth_Service SHALL reject the connection and return an error message stating that only Instagram Business accounts are supported.
7. IF a user attempts to connect a LinkedIn Personal profile (non-Company Page), THEN THE Auth_Service SHALL reject the connection and return an error message stating that LinkedIn Company Page verification is required.

---

### Requirement 3: AI-Assisted Content Generation

**User Story:** As a content creator, I want to generate draft posts using AI, so that I can produce platform-appropriate content faster.

#### Acceptance Criteria

1. WHEN a user requests AI-generated content with a topic and target Platform, THE AI_Generator SHALL return a draft post body formatted to the Platform's character and media constraints.
2. THE AI_Generator SHALL support GPT-4, Claude, and Llama as selectable model backends via LangChain.
3. WHEN the selected AI model backend is unavailable, THE AI_Generator SHALL return an error response within 10 seconds indicating which backend failed.
4. THE Content_Service SHALL store each AI-generated draft as a Post with status `draft` in the posts table.
5. WHEN a user edits an AI-generated draft, THE Content_Service SHALL preserve the original generated text and record the edited version as the current content.

---

### Requirement 4: Post Creation and Management

**User Story:** As a content creator, I want to create, edit, and delete posts, so that I can manage my content pipeline.

#### Acceptance Criteria

1. THE Content_Service SHALL allow a user to create a Post with a body, target Platform list, optional media attachments, and optional schedule.
2. WHEN a Post is created, THE Content_Service SHALL create one Platform_Post record per target Platform, each with an initial status of `pending`.
3. WHEN a user updates a Post that has not yet been published, THE Content_Service SHALL update the post body and associated Platform_Post records.
4. IF a user attempts to update a Post that has already been published to at least one Platform, THEN THE Content_Service SHALL reject the update and return an HTTP 409 response.
5. WHEN a user deletes a Post with status `draft` or `scheduled`, THE Content_Service SHALL remove the Post and all associated Platform_Post and Schedule records.
6. IF a user attempts to delete a Post with status `published`, THEN THE Content_Service SHALL reject the deletion and return an HTTP 409 response.
7. THE Content_Service SHALL validate that the Post body does not exceed the character limit of each target Platform before saving.

---

### Requirement 5: Media Management

**User Story:** As a content creator, I want to upload images and videos to attach to posts, so that my content is visually engaging.

#### Acceptance Criteria

1. WHEN a user uploads a media file, THE Media_Manager SHALL store the file in S3/MinIO and record the CDN URL in the media table.
2. THE Media_Manager SHALL accept image files in JPEG, PNG, GIF, and WebP formats.
3. THE Media_Manager SHALL accept video files in MP4 and MOV formats with a maximum file size of 512 MB.
4. IF a user uploads a video file exceeding 512 MB, THEN THE Media_Manager SHALL reject the upload and return an HTTP 413 response with a descriptive error message.
5. IF a user uploads a file in an unsupported format, THEN THE Media_Manager SHALL reject the upload and return an HTTP 415 response.
6. WHEN a media file is uploaded, THE Media_Manager SHALL generate an optimized thumbnail for image files and a preview frame for video files.
7. WHEN a Post is deleted, THE Media_Manager SHALL remove all media files associated exclusively with that Post from S3/MinIO storage.

---

### Requirement 6: Scheduling Engine

**User Story:** As a content creator, I want to schedule posts for future publication, so that content goes live at the optimal time without manual intervention.

#### Acceptance Criteria

1. WHEN a user creates a Schedule for a Post, THE Schedule_Service SHALL store the target publish time with timezone information in the schedules table.
2. THE Schedule_Service SHALL evaluate pending schedules at a minimum frequency of once per minute using a cron-based queue.
3. WHEN a scheduled publish time is reached, THE Schedule_Service SHALL enqueue the corresponding Post to the RabbitMQ publish queue for the Publisher_Worker.
4. THE Schedule_Service SHALL support scheduling in any IANA timezone.
5. WHEN a user cancels a Schedule before its publish time, THE Schedule_Service SHALL remove the schedule entry and revert the Post status to `draft`.
6. IF the Publisher_Worker fails to publish a Post, THEN THE Schedule_Service SHALL retry publication up to 3 times with exponential backoff before marking the Platform_Post status as `failed`.

---

### Requirement 7: Rate Limiting per Platform

**User Story:** As a platform operator, I want SMAS to respect per-platform posting limits, so that connected accounts are not suspended for API abuse.

#### Acceptance Criteria

1. THE Schedule_Service SHALL track the number of Posts published per Platform_Connection per calendar day.
2. WHEN the daily post count for a Platform_Connection reaches 50, THE Schedule_Service SHALL reject any further publish attempts for that Platform_Connection for the remainder of the calendar day and return a descriptive error.
3. WHEN a new calendar day begins (UTC midnight), THE Schedule_Service SHALL reset the daily post count for all Platform_Connections.
4. IF a scheduled Post would exceed the Rate_Limit for a Platform_Connection, THEN THE Schedule_Service SHALL notify the owning user and retain the Post in `scheduled` status for the next available day.

---

### Requirement 8: Multi-Platform Publishing

**User Story:** As a content creator, I want a single post to be published across multiple platforms simultaneously, so that I can maximize reach without duplicating effort.

#### Acceptance Criteria

1. WHEN the Publisher_Worker processes a Post targeting multiple Platforms, THE Publisher_Worker SHALL dispatch a separate API call to each target Platform.
2. WHEN a Platform_Post is successfully published, THE Publisher_Worker SHALL update the Platform_Post status to `published` and record the Platform-assigned post ID and publish timestamp.
3. IF a Platform API call fails, THEN THE Publisher_Worker SHALL update the affected Platform_Post status to `failed` and record the error message, without affecting the publication of other Platform_Posts for the same Post.
4. THE Publisher_Worker SHALL publish to X/Twitter using the Twitter API v2.
5. THE Publisher_Worker SHALL publish to LinkedIn using the LinkedIn Marketing API.
6. THE Publisher_Worker SHALL publish to Facebook Pages using the Meta Graph API.
7. THE Publisher_Worker SHALL publish to Instagram Business using the Meta Graph API.

---

### Requirement 9: Team Collaboration and Approval Workflow

**User Story:** As a team manager, I want to require approval before posts are published, so that content quality and brand compliance are maintained.

#### Acceptance Criteria

1. THE Auth_Service SHALL support at least three Roles: Admin, Editor, and Viewer, with distinct permission sets.
2. WHERE an Approval_Workflow is enabled for a team, THE Content_Service SHALL require a Post to reach `approved` status before the Schedule_Service enqueues it for publication.
3. WHEN an Editor submits a Post for approval, THE Content_Service SHALL notify all team members with the Admin Role via the configured notification channel.
4. WHEN an Admin approves a Post, THE Content_Service SHALL update the Post status to `approved` and allow scheduling to proceed.
5. WHEN an Admin rejects a Post, THE Content_Service SHALL update the Post status to `rejected` and notify the submitting Editor with the rejection reason.
6. WHILE a Post has `pending_approval` status, THE Content_Service SHALL prevent the submitting Editor from editing the Post body.

---

### Requirement 10: Analytics Dashboard

**User Story:** As a marketing manager, I want to view engagement metrics for published posts, so that I can evaluate content performance.

#### Acceptance Criteria

1. THE Analytics_Service SHALL aggregate engagement metrics (impressions, likes, shares, comments, clicks) for each Platform_Post from the respective Platform APIs.
2. THE Analytics_Service SHALL refresh cached metrics in the analytics_cache table at a minimum frequency of once per hour.
3. WHEN a user requests analytics for a Post, THE Analytics_Service SHALL return the most recently cached metrics within 200ms.
4. THE Analytics_Service SHALL provide aggregated metrics across all Platforms for a given Post.
5. WHEN Platform API rate limits prevent a metrics refresh, THE Analytics_Service SHALL retain the previously cached metrics and log the failure without surfacing an error to the user.

---

### Requirement 11: Webhook Integration

**User Story:** As a system integrator, I want to receive HTTP callbacks when SMAS events occur, so that I can trigger downstream workflows in external systems.

#### Acceptance Criteria

1. THE SMAS SHALL allow users to register Webhook endpoints with a URL and a list of subscribed event types.
2. WHEN a subscribed event occurs, THE SMAS SHALL send an HTTP POST request to the registered Webhook URL within 5 seconds, including a JSON payload describing the event.
3. IF a Webhook delivery fails (non-2xx response or timeout), THEN THE SMAS SHALL retry delivery up to 3 times with exponential backoff.
4. THE SMAS SHALL sign each Webhook payload with an HMAC-SHA256 signature using a per-webhook secret, included in the `X-SMAS-Signature` request header.
5. WHEN a Webhook endpoint returns non-2xx responses for 10 consecutive delivery attempts, THE SMAS SHALL automatically disable the Webhook and notify the registering user.
6. THE SMAS SHALL support the following event types: `post.published`, `post.failed`, `post.approved`, `post.rejected`, `platform_connection.expired`.

---

### Requirement 12: Audit Logging

**User Story:** As a compliance officer, I want a complete audit trail of all user actions, so that I can investigate incidents and demonstrate regulatory compliance.

#### Acceptance Criteria

1. THE Auth_Service SHALL record an audit log entry for every create, update, and delete operation performed by any user.
2. THE audit log entry SHALL include: user ID, action type, affected resource type, affected resource ID, timestamp (UTC), and the IP address of the request.
3. THE SMAS SHALL retain audit log entries for a minimum of 90 days.
4. WHEN an Admin queries the audit log, THE Auth_Service SHALL return entries filterable by user ID, resource type, action type, and time range.
5. THE audit_logs table SHALL be append-only; no user Role SHALL have permission to update or delete audit log entries.
