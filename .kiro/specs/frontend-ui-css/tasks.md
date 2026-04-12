# Implementation Plan: Frontend UI CSS

## Overview

Refactor the SMAS frontend from scattered inline `style` props into a cohesive pure-CSS design system. Introduces `global.css`, a shared authenticated `Layout` with persistent `Sidebar`, and replaces all inline styles across nine pages with CSS utility classes.

## Tasks

- [x] 1. Create `frontend/src/global.css` with the full design system
  - Define CSS custom properties on `:root`: `--color-primary`, `--color-primary-hover`, `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-success`, `--color-success-bg`, `--color-error`, `--color-error-bg`, `--radius`, `--sidebar-width`
  - Add box-sizing reset (`* { box-sizing: border-box }`), body margin/padding reset, base `font-family` and `line-height`
  - Add utility classes: `.btn`, `.btn-primary` (with `:hover` and `[disabled]` states), `.btn-danger`, `.btn-success`
  - Add form classes: `.input`, `.select`, `.textarea`
  - Add feedback classes: `.alert-success`, `.alert-error`
  - Add structural classes: `.card`, `.table`, `.th`, `.td`
  - Add layout classes: `.layout`, `.sidebar`, `.sidebar-nav`, `.sidebar-link`, `.sidebar-link.active`, `.main-content`
  - Add responsive media query at `768px` to collapse sidebar (stack layout vertically, sidebar full-width)
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.2, 6.3_

- [x] 2. Wire CSS into the app entry point
  - In `frontend/src/main.tsx`, add `import './global.css'` as the first import
  - _Requirements: 3.3_

- [x] 3. Create `frontend/src/components/Layout.tsx`
  - Create `frontend/src/components/` directory
  - Read `getAccessToken()` from `../lib/api`; if falsy, return `<Navigate to="/login" replace />`
  - Otherwise render `<div className="layout"><Sidebar /><main className="main-content"><Outlet /></main></div>`
  - _Requirements: 2.1, 2.5, 2.6_

  - [ ]* 3.1 Write property test for auth guard redirect (Property 1)
    - **Property 1: Auth guard redirects unauthenticated users**
    - Generate random localStorage states without a valid access token; render Layout; assert output is a redirect to `/login`
    - **Validates: Requirements 2.5**

- [x] 4. Create `frontend/src/components/Sidebar.tsx`
  - Render `<aside className="sidebar">` containing `<nav className="sidebar-nav">` with one `<NavLink>` per authenticated route using `className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}`
  - Routes: Dashboard (`/`), Compose (`/compose`), Schedule (`/schedule`), Approval (`/approval`), Analytics (`/analytics`), Connections (`/connections`), Webhooks (`/webhooks`), Audit Logs (`/audit-logs`)
  - Add a `<button className="btn btn-danger">` that calls `clearTokens()` then `navigate('/login', { replace: true })`
  - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 4.1 Write property test for active sidebar link (Property 2)
    - **Property 2: Active sidebar link receives active class**
    - Generate random route paths from the authenticated route set; render the app at that path; assert exactly one `.sidebar-link.active` exists and its `href` matches the current path
    - **Validates: Requirements 2.3**

- [x] 5. Update `frontend/src/App.tsx` — nested routing under Layout
  - Nest all authenticated routes under `<Route element={<Layout />}>`: `/`, `/compose`, `/schedule`, `/approval`, `/analytics`, `/connections`, `/webhooks`, `/audit-logs`
  - Keep `<Route path="/login" element={<LoginPage />} />` as a sibling (outside Layout)
  - Fix the `HomePage` import (the file exists at `./pages/HomePage` — ensure the import path resolves)
  - Import `Layout` from `./components/Layout`
  - _Requirements: 1.1, 1.2, 2.1, 2.6_

- [x] 6. Refactor `frontend/src/pages/HomePage.tsx`
  - Remove the `useEffect` auth-guard redirect (now handled by `Layout`)
  - Remove the `handleLogout` function and logout button (now in `Sidebar`)
  - Remove the `<ul>` nav list
  - Replace with a welcome heading and a grid of `<Link>` cards using `<div className="card">` for each of the 7 sections (Compose, Schedule, Approval, Analytics, Connections, Webhooks, Audit Logs)
  - Remove unused imports (`useEffect`, `clearTokens`, `getAccessToken`)
  - _Requirements: 1.1, 7.1, 7.2, 7.3_

- [x] 7. Refactor `frontend/src/pages/LoginPage.tsx`
  - Replace inline `style` props with CSS classes: container uses a wrapper class or inline-free layout, inputs use `.input`, submit button uses `.btn .btn-primary`, error paragraph uses `.alert-error`
  - _Requirements: 3.4, 4.1, 4.4, 6.1_

- [x] 8. Refactor `frontend/src/pages/ComposePage.tsx`
  - Replace all inline `style` props with CSS classes (`.input`, `.select`, `.textarea`, `.btn`, `.btn-primary`, `.card` for fieldsets/panels)
  - Keep the character-count `color` inline (dynamic computed value — documented exception per Requirements 6.1)
  - _Requirements: 3.4, 4.1, 6.1_

- [x] 9. Refactor `frontend/src/pages/SchedulePage.tsx`
  - Replace all inline `style` props with CSS classes (`.input`, `.select`, `.btn`, `.btn-danger` for cancel, `.card` for fieldset panels, `.alert-success`, `.alert-error`)
  - _Requirements: 3.4, 4.1, 4.4, 6.1_

- [x] 10. Refactor `frontend/src/pages/ApprovalPage.tsx`
  - Replace all inline `style` props with CSS classes (`.input`, `.textarea`, `.btn`, `.btn-success` for Approve, `.btn-danger` for Reject, `.card` for fieldset panels, `.alert-success`, `.alert-error`)
  - _Requirements: 3.4, 4.1, 4.4, 6.1_

- [x] 11. Refactor `frontend/src/pages/AnalyticsPage.tsx`
  - Replace all inline `style` props with CSS classes (`.input`, `.btn`, `.card` for fieldset panels, `.table`, `.th`, `.td`, `.alert-error`)
  - _Requirements: 3.4, 4.1, 6.1, 6.2, 6.3_

  - [ ]* 11.1 Write property test for semantic CSS classes on tables (Property 4)
    - **Property 4: Semantic elements carry correct CSS classes**
    - Render AnalyticsPage with generated platform row data; assert all `<table>`, `<th>`, `<td>` elements carry `.table`, `.th`, `.td` classes
    - **Validates: Requirements 6.2**

- [x] 12. Refactor `frontend/src/pages/ConnectionsPage.tsx`
  - Replace structural inline `style` props with CSS classes (`.card` for platform rows, `.alert-success` for the connected banner)
  - Keep per-platform `background` color on Connect buttons inline (dynamic brand color — documented exception per Requirements 6.1)
  - _Requirements: 3.4, 6.1, 6.3_

  - [ ]* 12.1 Write property test for no inline styles (Property 3)
    - **Property 3: No inline styles on page elements (except documented exceptions)**
    - For each page component, render with mock API data; assert no rendered DOM element has a `style` attribute except the character-count span on ComposePage and brand-color buttons on ConnectionsPage
    - **Validates: Requirements 3.4, 6.1**

- [x] 13. Refactor `frontend/src/pages/WebhooksPage.tsx`
  - Replace all inline `style` props with CSS classes (`.input`, `.btn`, `.btn-primary` for Register, `.btn-danger` for Delete, `.card` for the register section, `.table`, `.th`, `.td`, `.alert-error`)
  - _Requirements: 3.4, 4.1, 6.1, 6.2, 6.3_

  - [ ]* 13.1 Write property test for semantic CSS classes on WebhooksPage table (Property 4)
    - **Property 4: Semantic elements carry correct CSS classes**
    - Render WebhooksPage with generated webhook row data; assert all `<table>`, `<th>`, `<td>` elements carry `.table`, `.th`, `.td` classes
    - **Validates: Requirements 6.2**

- [x] 14. Refactor `frontend/src/pages/AuditLogsPage.tsx`
  - Replace all inline `style` props with CSS classes (`.input`, `.btn`, `.table`, `.th`, `.td`, `.alert-error`)
  - _Requirements: 3.4, 4.1, 6.1, 6.2_

  - [ ]* 14.1 Write property test for semantic CSS classes on AuditLogsPage table (Property 4)
    - **Property 4: Semantic elements carry correct CSS classes**
    - Render AuditLogsPage with generated log row data; assert all `<table>`, `<th>`, `<td>` elements carry `.table`, `.th`, `.td` classes
    - **Validates: Requirements 6.2**

- [x] 15. Checkpoint — verify compilation and layout
  - Ensure all TypeScript errors are resolved (especially the HomePage import in App.tsx)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Install test dependencies and write property-based tests
  - Install `fast-check`, `@testing-library/react`, `@testing-library/user-event` as dev dependencies in `frontend/`
  - Create `frontend/src/__tests__/` directory
  - Configure `vitest` to support jsdom environment (add `environment: 'jsdom'` to `frontend/vite.config.ts` test config)

  - [ ]* 16.1 Write property test for auth guard redirect (Property 1)
    - **Property 1: Auth guard redirects unauthenticated users**
    - File: `frontend/src/__tests__/Layout.test.tsx`
    - Use `fc.record({ token: fc.option(fc.string()) })` to generate localStorage states; for each, render Layout in a MemoryRouter; assert redirect to `/login` when token is absent
    - Run minimum 100 iterations (`numRuns: 100`)
    - **Validates: Requirements 2.5**

  - [ ]* 16.2 Write property test for active sidebar link (Property 2)
    - **Property 2: Active sidebar link receives active class**
    - File: `frontend/src/__tests__/Sidebar.test.tsx`
    - Use `fc.constantFrom('/compose', '/schedule', '/approval', '/analytics', '/connections', '/webhooks', '/audit-logs', '/')` to generate paths; render app at each path; assert exactly one `.sidebar-link.active` and its `href` matches
    - Run minimum 100 iterations (`numRuns: 100`)
    - **Validates: Requirements 2.3**

  - [ ]* 16.3 Write property test for no inline styles (Property 3)
    - **Property 3: No inline styles on page elements**
    - File: `frontend/src/__tests__/inlineStyles.test.tsx`
    - For each page component, render with fetch mocked to return empty/minimal data; assert no DOM element has a `style` attribute except the two documented exceptions
    - Run minimum 100 iterations (`numRuns: 100`)
    - **Validates: Requirements 3.4, 6.1**

  - [ ]* 16.4 Write property test for semantic CSS classes on table pages (Property 4)
    - **Property 4: Semantic elements carry correct CSS classes**
    - File: `frontend/src/__tests__/semanticClasses.test.tsx`
    - Use `fc.array(fc.record({...}))` to generate row data for AuditLogsPage, AnalyticsPage, WebhooksPage; assert `.table`, `.th`, `.td` classes present on all table elements
    - Run minimum 100 iterations (`numRuns: 100`)
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 16.5 Write property test for navigation cards routing (Property 5)
    - **Property 5: Navigation cards route correctly**
    - File: `frontend/src/__tests__/HomePage.test.tsx`
    - Use `fc.constantFrom` over the 7 nav card entries; render HomePage; simulate click; assert router navigated to expected path
    - Run minimum 100 iterations (`numRuns: 100`)
    - **Validates: Requirements 7.2**

- [x] 17. Final checkpoint — ensure all tests pass
  - Run `vitest --run` in `frontend/`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The two documented inline-style exceptions are: brand-color `background` on ConnectionsPage Connect buttons, and character-count `color` on ComposePage
- Property tests require `fast-check`, `@testing-library/react`, and `@testing-library/user-event` (task 16)
- Each property test must run a minimum of 100 iterations (`numRuns: 100`)
