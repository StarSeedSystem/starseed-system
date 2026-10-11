import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EnlacePoliGenesis } from '../enlace-poligenesis';
import { misEntidades } from '@/lib/genesis/entidades';

vi.mock('@/lib/genesis/entidades');

describe('EnlacePoliGenesis', () => {
  it('should render the link when entidadId or slug matches and rango >= 2', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: '1', slug: 'test-slug', rango: 3 },
      ],
    });

    render(<EnlacePoliGenesis entidadId="1" slug="test-slug" />);

    await vi.waitFor(() => {
      expect(screen.getByRole('link', { name: /gestionar con poligenesis/i })).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /gestionar con poligenesis/i });
    expect(link).toHaveAttribute('href', '/poligenesis?entidad=1');
  });

  it('should not render when entidadId or slug does not match', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: '2', slug: 'other-slug', rango: 3 },
      ],
    });

    render(<EnlacePoliGenesis entidadId="1" slug="test-slug" />);

    await vi.waitFor(() => {
      expect(screen.queryByRole('link', { name: /gestionar con poligenesis/i })).not.toBeInTheDocument();
    });
  });

  it('should not render when rango < 2', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: true,
      lista: [
        { id: '1', slug: 'test-slug', rango: 1 },
      ],
    });

    render(<EnlacePoliGenesis entidadId="1" slug="test-slug" />);

    await vi.waitFor(() => {
      expect(screen.queryByRole('link', { name: /gestionar con poligenesis/i })).not.toBeInTheDocument();
    });
  });

  it('should not render when misEntidades returns ok false', async () => {
    (misEntidades as any).mockResolvedValueOnce({
      ok: false,
      motivo: 'some error',
    });

    render(<EnlacePoliGenesis entidadId="1" slug="test-slug" />);

    await vi.waitFor(() => {
      expect(screen.queryByRole('link', { name: /gestionar con poligenesis/i })).not.toBeInTheDocument();
    });
  });
});