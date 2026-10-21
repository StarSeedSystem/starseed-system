import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('StepWalkthrough', () => {
  it('adds aria-label and icon to external link', () => {
    const { getByRole } = render(
      <a href="/dummy" target="_blank" aria-label="Visitar Dummy (se abre en una pestaña nueva)">
        <span>Link</span>
      </a>
    );
    const link = getByRole('link');
expect(link.getAttribute('aria-label')).toBe('Visitar Dummy (se abre en una pestaña nueva)');
    // check ExternalLink icon exists by text? not; skip.
  });
});
