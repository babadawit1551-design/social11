/**
 * Property 5: Navigation cards route correctly
 * Validates: Requirements 7.2
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as fc from 'fast-check';
import HomePage from '../pages/HomePage';

const NAV_CARDS = [
  { to: '/compose', label: 'Compose' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/approval', label: 'Approval' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/connections', label: 'Connections' },
  { to: '/webhooks', label: 'Webhooks' },
  { to: '/audit-logs', label: 'Audit Logs' },
];

describe('HomePage – Property 5: Navigation cards route correctly', () => {
  it('each nav card link points to the correct path', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAV_CARDS),
        (card) => {
          const { getByText, unmount } = render(
            <MemoryRouter>
              <HomePage />
            </MemoryRouter>
          );

          const link = getByText(card.label).closest('a');
          expect(link).not.toBeNull();
          expect(link!.getAttribute('href')).toBe(card.to);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
