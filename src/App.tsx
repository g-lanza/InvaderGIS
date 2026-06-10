/**
 * App — root component.
 *
 * Renders the six-region AppShell.
 * All layout, theming, and store wiring live in AppShell and its children.
 * Do not add feature UI here — the shell owns the frame; feature agents
 * write into their assigned sub-regions.
 */
import { AppShell } from '@/components/AppShell';

/** Root application component. Mounts the six-region shell. */
export function App() {
  return (
    <>
      <noscript>InvaderGIS requires JavaScript.</noscript>
      <AppShell />
    </>
  );
}
