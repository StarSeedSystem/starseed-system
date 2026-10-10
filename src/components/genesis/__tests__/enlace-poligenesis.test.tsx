import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { EnlacePoliGenesis } from '../enlace-poligenesis';
import { misEntidades } from '@/lib/genesis/entidades';

vi.mock('@/lib/genesis/entidades');

describe('EnlacePoliGenesis', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not render link when entity found with rango < 2', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: '1', slug: 'test-slug', rango: 1, nombre: 'Test' },
      ],
    });

    render(<EnlacePoliGenesis entidadId="1" />);

    const link = await screen.queryByRole('link', {
      name: /gestionar con poligenesis/i,
    });
    expect(link).not.toBeInTheDocument();
  });

  it('does not render link when entity not found', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: true,
      lista: [],
    });

    render(<EnlacePoliGenesis entidadId="999" />);

    const link = await screen.queryByRole('link', {
      name: /gestionar con poligenesis/i,
    });
    expect(link).not.toBeInTheDocument();
  });

  it('does not render link when misEntidades returns ok false', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: false,
      motivo: 'Error',
    });

    render(<EnlacePoliGenesis entidadId="1" />);

    const link = await screen.queryByRole('link', {
      name: /gestionar con poligenesis/i,
    });
    expect(link).not.toBeInTheDocument();
  });

  it('renders link when entity found with rango >= 2', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: '1', slug: 'test-slug', rango: 3, nombre: 'Test' },
      ],
    });

    render(<EnlacePoliGenesis entidadId="1" />);

    const link = await screen.findByRole('link', {
      name: /gestionar con poligenesis/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/poligenesis?entidad=1');
  });
});