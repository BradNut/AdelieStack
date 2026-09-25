# Web Glossary

## Svelte & SvelteKit

**Svelte**  
Reactive UI framework that compiles components to efficient JavaScript at build time.

**SvelteKit**  
Full-stack framework built on Svelte for building web applications with SSR, routing, and more.

**Runes**  
Svelte 5 primitives for reactivity: `$state`, `$derived`, `$effect`, `$props`, `$bindable`.

**$state**  
Rune for declaring reactive state in components.

**$derived**  
Rune for creating computed values that update when dependencies change.

**$effect**  
Rune for running side effects when reactive dependencies change.

**$props**  
Rune for declaring component props with type safety.

**$bindable**  
Rune for creating two-way bindable props.

**Hydration**  
Process of making server-rendered HTML interactive on the client.

**SSR (Server-Side Rendering)**  
Rendering pages on the server and sending HTML to the client.

**SSG (Static Site Generation)**  
Pre-rendering pages at build time to static HTML files.

**CSR (Client-Side Rendering)**  
Rendering pages in the browser using JavaScript.

**Prerendering**  
Generating static HTML for routes at build time (SSG in SvelteKit).

## Routing

**File-Based Routing**  
Routing system where file structure determines URL structure.

**Route**  
A URL path that maps to a page or endpoint.

**Layout**  
Shared UI wrapper for multiple routes (`+layout.svelte`).

**Page**  
Individual route component (`+page.svelte`).

**Load Function**  
Function that fetches data before rendering a page (`+page.ts` or `+page.server.ts`).

**Form Action**  
Server-side function that handles form submissions (`+page.server.ts`).

**Route Group**  
Directory with parentheses `(name)` that doesn't affect URL structure.

**Dynamic Route**  
Route with parameters in brackets `[id]`.

**Catch-All Route**  
Route that matches any path `[...path]`.

## Components

**Component**  
Reusable UI element defined in a `.svelte` file.

**Shadcn**  
Accessible component library built with Radix UI and Tailwind CSS.

**Slot**  
Placeholder in a component where child content is rendered.

**Snippet**  
Reusable chunk of markup in Svelte 5.

**Props**  
Data passed from parent to child component.

**Event Handler**  
Function that responds to user interactions.

## Styling

**Tailwind CSS**  
Utility-first CSS framework for rapid UI development.

**Utility Class**  
Single-purpose CSS class (e.g., `flex`, `p-4`, `text-lg`).

**cn() Utility**  
Helper function for conditionally combining class names.

**Responsive Design**  
Design that adapts to different screen sizes.

**Mobile-First**  
Design approach starting with mobile layout, then enhancing for larger screens.

**Breakpoint**  
Screen width threshold where layout changes (sm, md, lg, xl, 2xl).

## State Management

**Reactive State**  
Data that automatically updates the UI when changed.

**Derived State**  
Computed values that depend on other state.

**Store**  
Svelte's global state management primitive.

**Writable Store**  
Store that can be updated from anywhere.

**Readable Store**  
Store that can only be read, not updated externally.

**Derived Store**  
Store computed from other stores.

## Data Fetching

**Load Function**  
Function that runs before page render to fetch data.

**Server Load**  
Load function that runs only on the server (`+page.server.ts`).

**Universal Load**  
Load function that runs on both server and client (`+page.ts`).

**Streaming**  
Sending data to the client as it becomes available.

**Deferred Loading**  
Loading non-critical data after initial page render.

## Forms

**Form Action**  
Server-side function that processes form submissions.

**Progressive Enhancement**  
Building features that work without JavaScript, then enhancing with JS.

**use:enhance**  
SvelteKit directive for enhancing forms with client-side behavior.

**Form Validation**  
Checking form data for correctness before submission.

**Zod Schema**  
TypeScript-first schema validation library.

## Performance

**Code Splitting**  
Breaking JavaScript into smaller chunks loaded on demand.

**Lazy Loading**  
Loading resources only when needed.

**Tree Shaking**  
Removing unused code from the final bundle.

**Bundle**  
Compiled JavaScript file sent to the browser.

**Chunk**  
Piece of a code-split bundle.

**Minification**  
Removing whitespace and shortening variable names to reduce file size.

## Build & Deploy

**Vite**  
Fast build tool and dev server for modern web projects.

**Adapter**  
SvelteKit plugin that prepares the app for deployment (e.g., `adapter-node`).

**Build**  
Process of compiling source code into production-ready files.

**Dev Server**  
Local server for development with hot module replacement.

**HMR (Hot Module Replacement)**  
Updating modules in the browser without full page reload.

**Production Build**  
Optimized build for deployment.

## TypeScript

**Type Inference**  
TypeScript automatically determining types from context.

**Type Annotation**  
Explicitly specifying types in code.

**Interface**  
TypeScript construct for defining object shapes.

**Generic**  
Type parameter that makes code reusable with different types.

**Union Type**  
Type that can be one of several types (`string | number`).

**Type Guard**  
Function that narrows down types at runtime.

## Accessibility

**ARIA**  
Accessible Rich Internet Applications - attributes for screen readers.

**Semantic HTML**  
Using HTML elements for their intended purpose (e.g., `<nav>`, `<article>`).

**Screen Reader**  
Software that reads web content aloud for visually impaired users.

**Keyboard Navigation**  
Navigating a website using only the keyboard.

**Focus Management**  
Controlling which element receives keyboard input.

**WCAG**  
Web Content Accessibility Guidelines - standards for accessible web content.

## Security

**CSRF (Cross-Site Request Forgery)**  
Attack where unauthorized commands are submitted from a trusted user.

**XSS (Cross-Site Scripting)**  
Attack where malicious scripts are injected into web pages.

**CSP (Content Security Policy)**  
HTTP header that prevents XSS and other injection attacks.

**SameSite Cookie**  
Cookie attribute that prevents CSRF attacks.

**HttpOnly Cookie**  
Cookie that cannot be accessed by JavaScript.

## Testing

**Unit Test**  
Test of individual functions or components in isolation.

**Integration Test**  
Test of multiple components working together.

**E2E Test (End-to-End)**  
Test of complete user workflows in a real browser.

**Playwright**  
Browser automation tool for E2E testing.

**Vitest**  
Fast unit test framework for Vite projects.

**Testing Library**  
Library for testing UI components in a user-centric way.

**Mock**  
Fake implementation of a dependency for testing.

## Development Tools

**Biome**  
Fast linter and formatter for JavaScript/TypeScript.

**Turbo**  
Monorepo build system for fast, incremental builds.

**pnpm**  
Fast, disk-efficient package manager.

**ESLint**  
JavaScript linter for finding code issues.

**Prettier**  
Code formatter for consistent style.

## API Integration

**API Proxy**  
Server route that forwards requests to another API.

**API Contract**  
Shared type definitions for API requests and responses.

**Fetch**  
Browser API for making HTTP requests.

**REST API**  
API architecture using HTTP methods and URLs.

**JSON**  
JavaScript Object Notation - data format for APIs.
