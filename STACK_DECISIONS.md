## SIP/PRI Migration Tool — Stack, Libraries, and Rationale

### High-level
- Monorepo, single Next.js app (API routes + UI), TypeScript
- Reason: simple deploy (1 container), great DX, strong LLM agent compatibility (Claude Code, GPT‑5, Codex CLI all handle TS/Next well), polished UI quickly

### Core choices
- Runtime: Node.js 20+
- Framework: Next.js (App Router)
- Language: TypeScript (strict)
- Styling: Tailwind CSS + shadcn/ui
- Forms: React Hook Form + Zod resolver
- API validation: zod
- DB client: node-postgres (pg)
- CSV: @fast-csv/format (streaming), alternatively csv-writer for small payloads
- Logging: pino (pretty in dev)
- Config: dotenv + env-var schema with zod
- Testing: Vitest + Playwright (smoke E2E)
- Lint/format: ESLint + Prettier
- Container: Docker multi-stage; Bun not required; use PNPM to speed installs

### Alternatives considered
- Python (FastAPI + Jinja/HTMX or Streamlit): Familiar, but less cohesive SPA + server bundling; CSV is fine, but UI polish slower and agent patterns less standardized for TS UIs
- Flask: lightweight but more assembly
- SvelteKit: great DX, but team momentum and agent ecosystem favors Next.js
- Remix: good, but less ubiquitous than Next for internal support and agents

### Packages (exact)
- next, react, react-dom
- typescript, ts-node, zod, @hookform/resolvers, react-hook-form
- tailwindcss, postcss, autoprefixer, class-variance-authority, clsx, lucide-react, @radix-ui/react-* (via shadcn/ui)
- pg
- @fast-csv/format
- pino, pino-pretty
- dotenv
- vitest, @vitest/ui, @testing-library/react, @testing-library/jest-dom, playwright
- eslint, eslint-config-next, prettier

### Why this stack works well with coding agents
- TS types give agents a contract; Zod schemas guide runtime validation and tests
- Next API routes are file-conventional, easy for agents to locate and modify
- shadcn/ui gives consistent, accessible UI primitives agents can assemble safely
- Streaming CSV avoids memory spikes and creates natural checkpoints for agents/tests

### Deployment
- Dockerfile: multi-stage build (builder → runner)
- Expose port 3000; configure OUTPUT_DIR via env; mount bind volume if desired for CSVs
- Single container image runs both API and UI via `next start`

