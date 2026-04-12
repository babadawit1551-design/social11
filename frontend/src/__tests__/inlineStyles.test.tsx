/**
 * Property 3: No inline styles on page elements (except documented exceptions)
 * Validates: Requirements 3.4, 6.1
 *
 * Documented exceptions:
 *   1. ComposePage: char-count <span style={{ color: ... }}> — dynamic computed value
 *   2. ComposePage: fieldset <fieldset style={{ border: 'none', margin: 0, padding: 0 }}> — structural reset
 *   3. ComposePage: hidden file input <input style={{ display: 'none' }}> — functional necessity
 *   4. ConnectionsPage: Connect <button style={{ background: color, color: '#fff' }}> — brand color
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as fc from 'fast-check';

import ComposePage from '../pages/ComposePage';
import SchedulePage from '../pages/SchedulePage';
import ApprovalPage from '../pages/ApprovalPage';
import AnalyticsPage from '../pages/AnalyticsPage';
import ConnectionsPage from '../pages/ConnectionsPage';
import WebhooksPage from '../pages/WebhooksPage';
import AuditLogsPage from '../pages/AuditLogsPage';
import HomePage from '../pages/HomePage';

// Mock fetch so pages that call apiFetch on mount don't throw
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
    status: 200,
  }));
});

/** Collect all elements with a style attribute, excluding known exceptions */
function getDisallowedStyleElements(container: HTMLElement, pageId: string): Element[] {
  const all = Array.from(container.querySelectorAll('[style]'));
  return all.filter(el => {
    // ComposePage exceptions
    if (pageId === 'ComposePage') {
      // char-count span
      if (el.tagName === 'SPAN' && el.classList.contains('char-count')) return false;
      // borderless fieldset reset
      if (el.tagName === 'FIELDSET') return false;
      // hidden file input
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file') return false;
    }
    // ConnectionsPage exception: brand-color Connect buttons
    if (pageId === 'ConnectionsPage' && el.tagName === 'BUTTON') return false;
    return true;
  });
}

describe('Property 3: No inline styles on page elements (except documented exceptions)', () => {
  it('ComposePage has no disallowed inline styles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><ComposePage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'ComposePage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('SchedulePage has no inline styles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><SchedulePage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'SchedulePage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('ApprovalPage has no inline styles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><ApprovalPage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'ApprovalPage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('AnalyticsPage has no inline styles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><AnalyticsPage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'AnalyticsPage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('ConnectionsPage has no disallowed inline styles (brand-color buttons are exempt)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><ConnectionsPage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'ConnectionsPage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('WebhooksPage has no inline styles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><WebhooksPage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'WebhooksPage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('AuditLogsPage has no inline styles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><AuditLogsPage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'AuditLogsPage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('HomePage has no inline styles', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { container, unmount } = render(
          <MemoryRouter><HomePage /></MemoryRouter>
        );
        const violations = getDisallowedStyleElements(container, 'HomePage');
        expect(violations).toHaveLength(0);
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
