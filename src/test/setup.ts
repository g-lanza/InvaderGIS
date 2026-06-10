/**
 * Vitest global setup — runs before each test file (see vite.config.ts `test.setupFiles`).
 *
 * Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveAttribute,
 * …) so component tests can assert on the DOM, and wires automatic cleanup of the
 * React Testing Library render tree between tests so specs stay isolated.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
