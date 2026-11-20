# Project memory

## Product intent & audience

- Not yet determined. Project is a Next.js app; purpose and target audience unknown.

## Brand personality & voice

- Not yet inferred.

## Visual design & UX direction

- Not yet inferred.

## Decisions, constraints & rationale

- Framework: Next.js.
- Bolt-managed environment: Bolt auto-starts the dev server via the project's configured start command (`npm run dev:bolt`); manual startup is unnecessary.
- `dev:bolt` is a custom script (likely wraps `next dev` or similar) configured for the Bolt workflow.

## Open questions & assumptions

- App purpose, domain, and audience still undefined.
- Whether `dev:bolt` differs from standard `next dev` (e.g., custom port, host, env flags) is unverified.
- Design system, styling approach (Tailwind / CSS modules / styled-components), and component library choices not yet established.