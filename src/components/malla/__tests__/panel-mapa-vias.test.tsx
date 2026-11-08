import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PanelMapaVias } from '../panel-mapa-vias';
import { construirMapaVias } from '@/lib/malla/conectores/mapa-vias';

describe('PanelMapaVias', () => {
  afterEach(() => cleanup());
  it('enseña los 14 sistemas con su estado, medios y lo que falta', () => {
    render(<PanelMapaVias filas={construirMapaVias([], false)} />);
    expect(screen.getByRole('region', { name: 'Mapa de vías' })).not.toBeNull();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(14);
    expect(screen.getByTestId('mapa-vias-publicaciones-estado').textContent).toBe('No funciona');
    expect(screen.getByTestId('mapa-vias-resumen').textContent).toBe('0 de 14 funcionan ahora');
    expect(screen.getAllByText(/Registro vivo firmado/).length).toBeGreaterThan(0);
  });
  it('mientras mira dice que está mirando', () => {
    render(<PanelMapaVias filas={[]} cargando />);
    expect(screen.getByTestId('mapa-vias-resumen').textContent).toBe('mirando los medios…');
  });
});
