// Ambient declarations to keep TypeScript happy without installing @playwright/test yet
// These are minimal and intentionally typed as any to avoid coupling.
declare module '@playwright/test' {
  export const test: any
  export const expect: any
  export type Page = any
  export function defineConfig(config: any): any
}

