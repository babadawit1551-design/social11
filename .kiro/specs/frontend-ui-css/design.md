# Design Document: Frontend UI CSS

## Overview

This feature refactors the SMAS frontend from scattered inline `style` props into a cohesive pure-CSS design system. It introduces a shared authenticated layout with a persistent sidebar, a global CSS file with custom properties and utility classes, and a responsive breakpoint at 768px. No external UI library or Tailwind is used — just React 19, React Router v6 NavLink, TypeScript, and Vite.

The work splits into three concerns:
1. **CSS design system** — `global.css` with custom properties, reset, and utility classes
2. **Shared layout** — `Layout.tsx` (auth guard + shell) and `Sidebar.tsx` (nav + logout)
3. **Page refactors** — replace inline styles with CSS classes across all nine pages

---

## Architecture

```
main.tsx
  └─ import './global.css'          ← single CSS entry point
  └─ <BrowserRouter><App /></BrowserRouter>

App.tsx
  ├─ /login  → <LoginPage />        ← outside Layout, no sidebar
  └─ /*      → <Layout>             ← auth guard + shell
                 ├─ <Sidebar />     ← persistent nav
                 └─ <Outlet />      ← page content
```

The Layout component uses React Router's `<Outlet />` so all authenticated routes are nested under it. LoginPage is a sibling route, not a child, so it never sees the sidebar.

---

## Components and Interfaces

### `frontend/src/global.css`

Single CSS file imported once in `main.tsx`. Contains:
- CSS custom properties on `:root`
- Box-sizing reset and base body styles
- Utility classes: `.btn`, `.btn-primary`, `.btn-danger`, `.btn-success`, `.input`, `.select`, `.textarea`, `.alert-success`, `.alert-error`, `.card`, `.table`, `.th`, `.td`
- Layout classes: `.layout`, `.sidebar`, `.sidebar-nav`, `.sidebar-link`, `.sidebar-link.active`, `.main-content`
- Responsive media query at `768px` to collapse sidebar

### `frontend/src/components/Layout.tsx`

```tsx
interface LayoutProps {}  // no props — uses Outlet

// Reads access token from localStorage
// If no token → <Navigate to="/login" replace />
// Otherwise renders:
//   <div className="layout">
//     <Sidebar />
//     <main className="main-content"><Outlet /></main>
//   </div>
```

### `frontend/src/components/Sidebar.tsx`

```tsx
interface SidebarProps {}  // no props

// Renders:
//   <aside className="sidebar">
//     <nav className="sidebar-nav">
//       <NavLink to="/" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>Dashboard</NavLink>
//       ... (one NavLink per route)
//     </nav>
//     <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
//   </aside>
```

NavLink's `className` callback is used to apply the `active` class when the route matches. The logout handler calls `clearTokens()` then `navigate('/login', { replace: true })`.

### `frontend/src/App.tsx` (modified)

```tsx
// Authenticated routes nested under Layout via React Router nested routing:
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<Layout />}>
    <Route path="/" element={<HomePage />} />
    <Route path="/compose" element={<ComposePage />} />
    // ... all other authenticated routes
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

### `frontend/src/pages/HomePage.tsx` (modified)

Replaces the `<ul>` nav list with a card grid. Each card is a `<Link>` wrapped in a `<div className="card">`. The auth guard logic moves to `Layout.tsx`, so `HomePage` no longer needs its own `useEffect` redirect.

---

## Data Models

No new data models. The design system is purely presentational. The only state-adjacent concern is the auth token check in `Layout.tsx`, which reads from `localStorage` via the existing `getAccessToken()` utility from `lib/api.ts`.

CSS custom properties (the "data model" of the design system):

```css
:root {
  --color-primary: #0066cc;
  --color-primary-hover: #0052a3;
  --color-bg: #f4f6f8;
  --color-surface: #ffffff;
  --color-border: #dde1e7;
  --color-text: #1a1a2e;
  --color-text-muted: #6b7280;
  --color-success: #155724;
  --color-success-bg: #d4edda;
  --color-error: #721c24;
  --color-error-bg: #f8d7da;
  --radius: 6px;
  --sidebar-width: 220px;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Auth guard redirects unauthenticated users

*For any* render of the Layout component when no access token is present in localStorage, the component should redirect to `/login` rather than rendering the sidebar or page content.

**Validates: Requirements 2.5**

### Property 2: Active sidebar link receives active class

*For any* authenticated route, the NavLink in the Sidebar corresponding to the current path should have the `active` CSS class applied, and all other NavLinks should not.

**Validates: Requirements 2.3**

### Property 3: No inline styles on page elements (except documented exceptions)

*For any* page component (ComposePage, SchedulePage, ApprovalPage, AnalyticsPage, ConnectionsPage, WebhooksPage, AuditLogsPage, HomePage), the rendered JSX should contain no inline `style` attributes on elements, with the sole exceptions of: the character-count color span on ComposePage and the brand-color buttons on ConnectionsPage.

**Validates: Requirements 3.4, 6.1**

### Property 4: Semantic elements carry correct CSS classes

*For any* page that renders a table, all `<table>`, `<th>`, and `<td>` elements should carry the `.table`, `.th`, and `.td` CSS classes respectively. *For any* page that renders a card/panel container, that container should carry the `.card` CSS class.

**Validates: Requirements 6.2, 6.3**

### Property 5: Navigation cards route correctly

*For any* navigation card rendered on HomePage, clicking that card should navigate to the route matching the card's label (e.g. "Compose" → `/compose`).

**Validates: Requirements 7.2**

---

## Error Handling

**Auth guard**: If `getAccessToken()` returns null/empty, `Layout` renders `<Navigate to="/login" replace />` immediately — no flash of authenticated content.

**Logout**: `clearTokens()` is called synchronously before `navigate()`, so tokens are always cleared even if navigation fails.

**CSS loading failure**: If `global.css` fails to load (e.g. build misconfiguration), pages degrade gracefully — they remain functional but unstyled. No runtime errors are thrown.

**Dynamic inline styles (allowed exceptions)**:
- `ConnectionsPage`: per-platform `background` color on Connect buttons — these are data-driven brand colors that cannot be expressed as static CSS classes.
- `ComposePage`: character-count `color` (red when over limit) — this is a computed boolean that drives a color change, best expressed inline or via a conditional class.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are used. Unit tests cover specific structural examples and integration points. Property tests verify universal behaviors across generated inputs.

### Unit Tests (Vitest + React Testing Library)

Focus on specific examples and structural checks:

- `Layout` renders Sidebar and Outlet when authenticated
- `Layout` redirects to `/login` when no token present (example)
- `Sidebar` renders all 8 navigation links
- `Sidebar` logout button clears tokens and navigates
- `LoginPage` renders without a Sidebar
- `HomePage` renders a card grid (not a `<ul>` nav list)
- `global.css` contains all required custom properties (file content check)
- `global.css` contains all required utility class selectors
- `main.tsx` imports `./global.css`

### Property-Based Tests (fast-check, minimum 100 iterations each)

fast-check is the recommended PBT library for TypeScript/React projects. Install with:
```
npm install --save-dev fast-check @testing-library/react @testing-library/user-event
```

**Property Test 1: Auth guard redirects unauthenticated users**
Generate random localStorage states without a valid access token. For each, render Layout and assert the output is a redirect to `/login`.
```
// Feature: frontend-ui-css, Property 1: auth guard redirects unauthenticated users
```

**Property Test 2: Active sidebar link receives active class**
Generate random route paths from the set of authenticated routes. For each, render the app at that path and assert exactly one `.sidebar-link.active` exists and its `href` matches the current path.
```
// Feature: frontend-ui-css, Property 2: active sidebar link receives active class
```

**Property Test 3: No inline styles on page elements**
For each page component, render it with generated mock API data (using MSW or fetch mocks). Assert that no rendered DOM element has a `style` attribute, except for the two documented exceptions.
```
// Feature: frontend-ui-css, Property 3: no inline styles on page elements
```

**Property Test 4: Semantic elements carry correct CSS classes**
For each page that uses tables (AuditLogsPage, AnalyticsPage, WebhooksPage), render with generated row data and assert all `<table>`, `<th>`, `<td>` elements have the correct CSS classes. For each page that uses cards, assert `.card` class is present.
```
// Feature: frontend-ui-css, Property 4: semantic elements carry correct CSS classes
```

**Property Test 5: Navigation cards route correctly**
Generate a random selection of the 7 nav card entries. For each, render HomePage, simulate a click on that card, and assert the router navigated to the expected path.
```
// Feature: frontend-ui-css, Property 5: navigation cards route correctly
```

### Test Configuration

Each property test must run a minimum of 100 iterations (`numRuns: 100` in fast-check). Tests live in `frontend/src/__tests__/` and run via `vitest --run`.
