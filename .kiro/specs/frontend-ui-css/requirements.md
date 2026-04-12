# Requirements Document

## Introduction

This feature improves the SMAS (Social Media Automation System) frontend by fixing a broken module import, introducing a shared layout with persistent sidebar navigation, and applying a consistent pure-CSS design system across all authenticated pages. The result is a clean, modern, responsive UI built with React 19, React Router v6, TypeScript, and Vite — no external UI library or Tailwind.

## Glossary

- **App**: The React application entry point (`App.tsx`) that defines all routes.
- **Layout**: A shared React component that wraps all authenticated pages and renders the Sidebar and a main content area.
- **Sidebar**: A persistent left-hand navigation panel rendered on all authenticated pages, containing links to every page and a logout button.
- **Page**: One of the nine route-level components: LoginPage, HomePage (dashboard), ComposePage, SchedulePage, ApprovalPage, AnalyticsPage, ConnectionsPage, WebhooksPage, AuditLogsPage.
- **Design_System**: The set of CSS custom properties (variables), base reset rules, and reusable utility classes defined in `global.css`.
- **Auth_Guard**: Logic that redirects unauthenticated users to `/login` before rendering a protected page.
- **Toast**: A transient status message (success or error) displayed to the user after an action.

---

## Requirements

### Requirement 1: Fix Missing HomePage Module

**User Story:** As a developer, I want the App.tsx module import for HomePage to resolve correctly, so that the application compiles without errors.

#### Acceptance Criteria

1. THE App SHALL import `HomePage` from a file that exists at `frontend/src/pages/HomePage.tsx`.
2. WHEN the Vite dev server starts, THE App SHALL compile without any "Cannot find module" TypeScript errors.

---

### Requirement 2: Shared Authenticated Layout with Persistent Sidebar

**User Story:** As a user, I want a persistent sidebar navigation on every authenticated page, so that I can navigate between sections without losing context.

#### Acceptance Criteria

1. THE Layout SHALL render a Sidebar and a main content area side-by-side on all authenticated routes (`/`, `/compose`, `/schedule`, `/approval`, `/analytics`, `/connections`, `/webhooks`, `/audit-logs`).
2. THE Sidebar SHALL contain navigation links to: Dashboard (`/`), Compose, Schedule, Approval, Analytics, Connections, Webhooks, and Audit Logs.
3. THE Sidebar SHALL highlight the currently active route link using a distinct visual style (e.g. background color or left border accent).
4. THE Sidebar SHALL contain a Logout button that clears stored tokens and redirects the user to `/login`.
5. WHEN a user is not authenticated (no access token in localStorage), THE Layout SHALL redirect the user to `/login`.
6. THE LoginPage SHALL render outside the Layout, with no Sidebar visible.

---

### Requirement 3: Global CSS Design System

**User Story:** As a developer, I want a single source of truth for colors, spacing, and typography, so that all pages share a consistent visual language.

#### Acceptance Criteria

1. THE Design_System SHALL define CSS custom properties for: primary color, primary hover color, background color, surface color, border color, text color, muted text color, success color, error color, and base border radius.
2. THE Design_System SHALL include a CSS reset that sets `box-sizing: border-box` on all elements, removes default margin/padding from `body`, and sets a base `font-family` and `line-height`.
3. THE Design_System SHALL be loaded once in `main.tsx` via a single `import './global.css'` statement.
4. WHEN any Page renders, THE Page SHALL use CSS classes defined in the Design_System rather than inline `style` props for layout, color, and spacing.

---

### Requirement 4: Consistent Form and Input Styling

**User Story:** As a user, I want all form inputs, selects, textareas, and buttons to look consistent across every page, so that the UI feels cohesive.

#### Acceptance Criteria

1. THE Design_System SHALL define reusable CSS classes for: `.input`, `.select`, `.textarea`, `.btn`, `.btn-primary`, `.btn-danger`, `.btn-success`.
2. WHEN a `.btn-primary` element is hovered, THE Design_System SHALL apply the primary hover color as the background.
3. WHEN a `.btn` element has the `disabled` attribute, THE Design_System SHALL apply a reduced-opacity style and a `not-allowed` cursor.
4. THE Design_System SHALL define `.alert-success` and `.alert-error` classes for status/toast messages with appropriate background and text colors drawn from the CSS custom properties.

---

### Requirement 5: Responsive Layout

**User Story:** As a user on a smaller screen, I want the layout to remain usable, so that I can access all features on a tablet or narrow browser window.

#### Acceptance Criteria

1. WHILE the viewport width is 768px or wider, THE Layout SHALL display the Sidebar and main content area side-by-side.
2. WHILE the viewport width is below 768px, THE Layout SHALL collapse the Sidebar into a top navigation bar or hide it behind a toggle, so that the main content occupies the full width.
3. THE Design_System SHALL define a breakpoint variable or media query at 768px used consistently for responsive rules.

---

### Requirement 6: Page-Level Inline Style Removal

**User Story:** As a developer, I want all inline `style` props replaced with CSS classes, so that the codebase is maintainable and styles are easy to override.

#### Acceptance Criteria

1. THE App SHALL contain no inline `style` props on JSX elements after the refactor, except for dynamically computed values that cannot be expressed as static CSS (e.g. per-platform brand colors on ConnectionsPage buttons, character-count color on ComposePage).
2. WHEN a Page uses a table, THE Page SHALL apply `.table`, `.th`, and `.td` CSS classes defined in the Design_System instead of inline `thStyle`/`tdStyle` objects.
3. WHEN a Page uses a card or panel section, THE Page SHALL apply a `.card` CSS class defined in the Design_System.

---

### Requirement 7: Dashboard (HomePage) Content

**User Story:** As a user, I want the dashboard to show a meaningful summary rather than just a nav list, so that I have a useful landing page after login.

#### Acceptance Criteria

1. THE HomePage SHALL display a welcome heading and a grid of navigation cards, one per section (Compose, Schedule, Approval, Analytics, Connections, Webhooks, Audit Logs).
2. WHEN a navigation card is clicked, THE HomePage SHALL navigate to the corresponding route.
3. THE HomePage SHALL NOT duplicate the Sidebar navigation links as a plain `<ul>` list, since the Sidebar already provides navigation.
