## SIP/PRI Tool – UI Style Guide, Design System, and Architecture Reference

Use this guide to build a separate tool with a UI/UX that looks and feels consistent with the SIP/PRI Migration Tool. It distills visual tokens, component patterns, interaction models, and the technical stack.

---

## 1) Visual Design System (Tokens & Theming)

### Color, Radius, and Theme Tokens
Tokens are defined in CSS variables and mapped to Tailwind CSS v4 via `@theme inline` in `src/app/globals.css`. Prefer semantic tokens (background, primary, border, ring) instead of hard-coded colors.

Key tokens:
- Base (light): `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`
- Charts and Sidebar: `--chart-1..5`, `--sidebar-*`
- Radii: `--radius` (10px approx), with derived `--radius-sm/md/lg/xl`
- Dark mode overrides under `.dark { ... }`

Example (excerpt):
<augment_code_snippet mode="EXCERPT" path="src/app/globals.css">
````css
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --ring: oklch(0.708 0 0);
}
````
</augment_code_snippet>

Accents used in components:
- Primary accent hex seen across components: `#52B4FA` (focus rings, buttons, headings highlights)
- Success/Green and Error/Red used for feedback states

Dark mode:
- Class-based (`.dark`) with token overrides; rely on `bg-background text-foreground` utilities.

### Typography
- Variables: `--font-geist-sans`, `--font-geist-mono` (fallback to system fonts if not available)
- Base text size: `text-sm` in components; headings come from component semantics (CardTitle, etc.)
- Use concise, informative copy; avoid long paragraphs inside forms.

### Spacing and Layout
- Spacing: Tailwind defaults; common gaps: `gap-2/3/4/6/8`
- Rounding: `rounded-lg` by default; `rounded` scale increases for larger buttons/cards
- Cards for grouping content; `max-w-5xl mx-auto` patterns for page content are recommended

### Motion
- Subtle transitions: `transition-all duration-200`
- Button active state: slight scale (`active:scale-[0.98]`)
- Avoid large/long animations; prefer subtle feedback

---

## 2) Component Library and Patterns

The project uses shadcn/ui conventions with Tailwind; primitives are in `src/components/ui/*`. Use these as baselines and do not re-invent variants.

### Buttons
- Variants: `default`, `secondary`, `outline`, `destructive`
- Sizes: `sm`, `default`, `lg`
- Primary styling: background `#52B4FA`, white text, hover darken, subtle shadow

Example:
<augment_code_snippet mode="EXCERPT" path="src/components/ui/button.tsx">
````ts
const buttonVariants = cva(
  "inline-flex items-center justify-center ... focus-visible:ring-[#52B4FA]",
  { variants: { variant: { default: "bg-[#52B4FA] text-white ..." } } }
)
````
</augment_code_snippet>

### Inputs
- 44px+ height (`h-11`), dark background, clear focus ring in accent color
- Disabled has reduced opacity; consistent ring-offset styles

<augment_code_snippet mode="EXCERPT" path="src/components/ui/input.tsx">
````tsx
<input type={type} className={cn(
  "h-11 w-full rounded-lg border bg-gray-700 px-4 text-white ",
  "focus-visible:ring-2 focus-visible:ring-[#52B4FA]"
)} />
````
</augment_code_snippet>

### Cards, Dialogs, Popovers, Selects
- Use the provided `Card`, `Dialog`, `Popover`, `Select` primitives in `src/components/ui`
- Keep content dense but readable; leverage `CardHeader`, `CardTitle`, `CardDescription`

### Icons
- `lucide-react` for consistent iconography; size `h-4 w-4` to `h-6 w-6`

### Command/Combobox
- Use `cmdk`-based comboboxes (`sip-binding-combobox.tsx`) for searchable selects
- Provide hint text below fields (`text-xs text-gray-400`)

### Toasters and Feedback
- `Toast` for non-blocking feedback (success/info/error)
- Progress overlay component for longer operations
- Error panels use red-tinted `Card` with concise messages

### Keyboard Shortcuts (recommended)
- Submit: Ctrl/Cmd + Enter
- Reset: Ctrl/Cmd + R
- Toggle help: Ctrl/Cmd + /
- Close results: Escape

---

## 3) Form Patterns and Validation

- Forms: React Hook Form + Zod schema via `@hookform/resolvers/zod`
- Required indicators: accent asterisk next to Label
- Error messages: concise, `text-sm text-red-400`, prefixed with a small dot
- For custom components (combobox), use RHF `Controller`

Validation schema example:
<augment_code_snippet mode="EXCERPT" path="src/components/migration-form.tsx">
````ts
const formSchema = z.object({
  binding: z.string().min(1),
  domain: z.string().min(1),
  trunk: z.string().min(1),
  account: z.string().min(1),
  location: z.enum(['Chicago','Phoenix','Ashburn'])
})
````
</augment_code_snippet>

UX details:
- Auto-save to localStorage on field changes
- Show "+ saved" indicator; clear on success
- Non-blocking toast during long tasks; overlay progress indicator when needed

---

## 4) App Structure and Architecture

### Framework and Routing
- Next.js 15 (App Router) with TypeScript
- API routes under `src/app/api/*` (e.g., `/api/generate`, `/api/bindings`)
- Server utilities under `src/lib/*` (e.g., database access, CSV helpers, logger)

### Data and Validation Flow
- Client form -> zod validation (client) -> POST to API -> zod validation (server) -> DB access via `pg`
- Logging via `pino` on the server side (structured; pretty in dev)

### Packages in Use (core)
- UI/UX: `tailwindcss@4`, `@tailwindcss/postcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@radix-ui/*`, `cmdk`, `tw-animate-css`
- Forms/Validation: `react-hook-form`, `zod`, `@hookform/resolvers`
- Data/Server: `pg` (node-postgres), `dotenv`, `uuid`, `pino`
- Search (client): `fuse.js`
- Testing: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`

Scripts (package.json):
- `dev`: `next dev --turbopack`
- `build`: `next build --turbopack`
- `start`: `next start`
- `lint`: `eslint`
- `test`: `vitest`
- `type-check`: `tsc --noEmit`

PostCSS/Tailwind:
<augment_code_snippet mode="EXCERPT" path="postcss.config.mjs">
````js
export default { plugins: ["@tailwindcss/postcss"] };
````
</augment_code_snippet>

shadcn/ui config (aliases, lucide icons, base color):
<augment_code_snippet mode="EXCERPT" path="components.json">
````json
{ "style": "new-york", "tailwind": { "css": "src/app/globals.css",
  "baseColor": "neutral", "cssVariables": true }, "iconLibrary": "lucide" }
````
</augment_code_snippet>

### Directory Layout (essentials)
- `src/components/ui/*`  Reusable UI primitives (Button, Input, Card, Dialog, Select, Toast, etc.)
- `src/components/*`  Composite components (forms, combobox, progress)
- `src/lib/*`  Server utilities (db, csv, logger)
- `src/app/*`  Routes and API endpoints

### Conventions
- Use `cn()` helper for conditional classnames
- Use `cva()` for component variants; export both component and `*Variants` when useful
- Keep UI presentational; move data and business logic to server or dedicated libs
- Prefer semantic Tailwind tokens (bg-background, text-foreground) over raw colors
- Use path aliases (`@/components`, `@/lib`, etc.) from `components.json`

---

## 5) Page Templates and UX Patterns

### App Shell
- Header with title and minimal controls
- Content constrained to readable width, centered on larger screens

### Primary Form Page
- `Card` with `CardHeader` and `CardDescription`
- Inputs stack with helpful hints under each; required asterisks in accent color
- Submit button full-width, large size
- Keyboard shortcuts enabled as above

### Results Page/State
- Success summary card with stats and green accent
- Download cards with icons and clear CTA buttons
- One-click reset action to start a new task

### Error and Empty States
- Use red-tinted `Card` with concise, human-readable message
- Provide immediate remediation: Retry, Reset, or Back to Form

### Tables/Lists (if applicable in your tool)
- Use `Card` wrapping a simple table/grid
- Maintain comfortable density; avoid oversized rows
- Provide icon cues for status

---

## 6) Accessibility and Internationalization

- Labels associated with inputs; visible focus states
- Sufficient color contrast (tokens adhere to high-contrast scheme)
- Use ARIA roles for dialogs, popovers; rely on Radix primitives for a11y behaviors
- Keep icon-only buttons labelled with `aria-label`

---

## 7) Reuse Checklist for Your New Tool (Adtran/Netsapiens Automation)

- Copy `src/app/globals.css` to inherit tokens and theme
- Import and reuse `src/components/ui/*` primitives (Button, Input, Card, Dialog, Select, Toast)
- Keep the primary accent `#52B4FA` for visual continuity
- Use React Hook Form + Zod for all forms
- Provide the same keyboard shortcuts
- Use `lucide-react` icons with similar sizing
- Maintain feedback patterns: Toast for async status, ProgressIndicator overlay for long tasks
- Structure API endpoints under `/api/*` with zod validation

---

## 8) Example Snippets

Primary action button:
<augment_code_snippet mode="EXCERPT" path="src/components/ui/button.tsx">
````tsx
<Button size="lg" className="w-full">
  Continue
</Button>
````
</augment_code_snippet>

Label with required indicator and hint:
<augment_code_snippet mode="EXCERPT" path="src/components/migration-form.tsx">
````tsx
<Label>Domain<span className="text-[#52B4FA] ml-1">*</span></Label>
<p className="text-xs text-gray-400">Target platform domain</p>
````
</augment_code_snippet>

Toast usage:
<augment_code_snippet mode="EXCERPT" path="src/components/migration-form.tsx">
````tsx
{showToast.show && (
  <Toast message={showToast.message} type={showToast.type} onClose={...} />
)}
````
</augment_code_snippet>

---

## 9) Testing and Quality

- Unit tests: `vitest` + Testing Library for components and utils
- Type safety: strict TypeScript; no `any`; prefer typed helpers
- Linting: `eslint` with Next config; keep classnames small and consistent

---

## 10) Notes and Options

- Tailwind v4 with `@tailwindcss/postcss`; no separate tailwind.config file required for basic usage
- Optional desktop packaging may exist (Tauri) but is not required for consistent web UI/UX
- Prefer separation of concerns: UI components (presentational), lib (data), api routes (IO)

