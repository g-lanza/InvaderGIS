/**
 * ErrorState component test — also serves as the canary that the jsdom +
 * @testing-library/react harness (vite.config.ts test block + src/test/setup.ts)
 * actually works. Before Wave 5 these devDeps were installed but unrunnable.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders the title and body and exposes an alert role', () => {
    render(<ErrorState title="Failed to load records" body="HTTP 500 from /data" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load records')).toBeInTheDocument();
    expect(screen.getByText('HTTP 500 from /data')).toBeInTheDocument();
  });

  it('renders an optional action when provided', () => {
    render(<ErrorState title="x" body="y" action={<button>Retry</button>} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('applies an extra className onto the root', () => {
    const { container } = render(<ErrorState title="x" body="y" className="extra" />);
    expect(container.querySelector('.msa-empty--error.extra')).not.toBeNull();
  });
});
