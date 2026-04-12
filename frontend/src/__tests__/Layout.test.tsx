/**
 * Property 1: Auth guard redirects unauthenticated users
 * Validates: Requirements 2.5
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as fc from 'fast-check';
import Layout from '../components/Layout';

afterEach(() => {
  localStorage.clear();
});

describe('Layout – Property 1: Auth guard redirects unauthenticated users', () => {
  it('redirects to /login when no token is present', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1 }), { nil: null }),
        (token) => {
          localStorage.clear();
          if (token) {
            localStorage.setItem('access_token', token);
          }

          const { container, unmount } = render(
            <MemoryRouter initialEntries={['/']}>
              <Layout />
            </MemoryRouter>
          );

          if (!token) {
            // Should render a Navigate redirect — no layout content
            expect(container.querySelector('.layout')).toBeNull();
          } else {
            // Token present — layout renders (Outlet is empty but layout div exists)
            expect(container.querySelector('.layout')).not.toBeNull();
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
