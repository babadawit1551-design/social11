/**
 * Property 2: Active sidebar link receives active class
 * Validates: Requirements 2.3
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as fc from 'fast-check';
import Sidebar from '../components/Sidebar';

beforeEach(() => {
  localStorage.clear();
});

describe('Sidebar – Property 2: Active sidebar link receives active class', () => {
  it('exactly one sidebar-link has the active class for each route', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '/',
          '/compose',
          '/schedule',
          '/approval',
          '/analytics',
          '/connections',
          '/webhooks',
          '/audit-logs'
        ),
        (path) => {
          const { container, unmount } = render(
            <MemoryRouter initialEntries={[path]}>
              <Sidebar />
            </MemoryRouter>
          );

          const activeLinks = container.querySelectorAll('.sidebar-link.active');
          expect(activeLinks.length).toBe(1);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
