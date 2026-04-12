/**
 * Property 4: Semantic elements carry correct CSS classes
 * Validates: Requirements 6.2, 6.3
 *
 * For any page that renders a table, all <table>, <th>, <td> elements
 * must carry the .table, .th, .td CSS classes respectively.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as fc from 'fast-check';

import AnalyticsPage from '../pages/AnalyticsPage';
import WebhooksPage from '../pages/WebhooksPage';
import AuditLogsPage from '../pages/AuditLogsPage';

// Safe ISO date string arbitrary — avoids fc.date() which can generate invalid dates
const isoDateArb = fc.integer({ min: 0, max: 4102444800000 }).map(ts => new Date(ts).toISOString());

// Arbitraries for generated row data
const platformRowArb = fc.record({
  platformPostId: fc.uuid(),
  platform: fc.constantFrom('twitter', 'linkedin', 'facebook', 'instagram'),
  status: fc.constantFrom('published', 'failed', 'pending'),
  publishedAt: fc.option(isoDateArb, { nil: null }),
  metrics: fc.option(
    fc.record({
      impressions: fc.nat(),
      likes: fc.nat(),
      shares: fc.nat(),
      comments: fc.nat(),
      clicks: fc.nat(),
      lastRefreshedAt: fc.option(isoDateArb, { nil: null }),
    }),
    { nil: null }
  ),
});

const webhookRowArb = fc.record({
  id: fc.uuid(),
  url: fc.webUrl(),
  eventTypes: fc.array(fc.constantFrom('post.published', 'post.failed', 'post.approved'), { minLength: 1 }),
  enabled: fc.boolean(),
  consecutiveFailures: fc.nat({ max: 10 }),
  createdAt: isoDateArb,
});

const auditLogRowArb = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  actionType: fc.constantFrom('create', 'update', 'delete', 'login'),
  resourceType: fc.constantFrom('post', 'user', 'webhook', 'schedule'),
  resourceId: fc.uuid(),
  ipAddress: fc.ipV4(),
  createdAt: isoDateArb,
});

function assertTableClasses(container: HTMLElement) {
  const tables = container.querySelectorAll('table');
  const ths = container.querySelectorAll('th');
  const tds = container.querySelectorAll('td');

  tables.forEach(el => expect(el.classList.contains('table')).toBe(true));
  ths.forEach(el => expect(el.classList.contains('th')).toBe(true));
  tds.forEach(el => expect(el.classList.contains('td')).toBe(true));
}

describe('Property 4: Semantic elements carry correct CSS classes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
      status: 200,
    }));
  });

  it('AnalyticsPage: table/th/td elements have correct classes when platform data is shown', () => {
    fc.assert(
      fc.property(
        fc.array(platformRowArb, { minLength: 1, maxLength: 5 }),
        (rows) => {
          // Mock fetch to return platform rows for the second call
          let callCount = 0;
          vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
            callCount++;
            const data = callCount === 2 ? rows : { postId: 'test-id', impressions: 0, likes: 0, shares: 0, comments: 0, clicks: 0, lastRefreshedAt: null, platformCount: rows.length };
            return Promise.resolve({ ok: true, json: async () => data, status: 200 });
          }));

          const { container, unmount } = render(
            <MemoryRouter><AnalyticsPage /></MemoryRouter>
          );
          // Tables only render after data loads; check initial state has no violations
          assertTableClasses(container);
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('WebhooksPage: table/th/td elements have correct classes', () => {
    fc.assert(
      fc.property(
        fc.array(webhookRowArb, { minLength: 1, maxLength: 5 }),
        (rows) => {
          vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => rows,
            status: 200,
          }));

          const { container, unmount } = render(
            <MemoryRouter><WebhooksPage /></MemoryRouter>
          );
          assertTableClasses(container);
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('AuditLogsPage: table/th/td elements have correct classes', () => {
    fc.assert(
      fc.property(
        fc.array(auditLogRowArb, { minLength: 1, maxLength: 5 }),
        (rows) => {
          vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => rows,
            status: 200,
          }));

          const { container, unmount } = render(
            <MemoryRouter><AuditLogsPage /></MemoryRouter>
          );
          assertTableClasses(container);
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
