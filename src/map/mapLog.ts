/**
 * mapLog — dev-only console logger for map layer load/progress messages.
 *
 * These messages ("[eventsLayer] Loaded N features …") are diagnostic noise for
 * developers, not user-facing output. They must NOT ship in the production
 * bundle. Vite statically replaces `import.meta.env.DEV` with a literal boolean
 * at build time, so in a production build this collapses to `false && …` and the
 * call (and its string concatenation) is tree-shaken away.
 *
 * Use for informational progress logs only. Genuine problems should still use
 * console.warn / console.error directly so they surface in production.
 */
export function mapLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info(...args);
  }
}
