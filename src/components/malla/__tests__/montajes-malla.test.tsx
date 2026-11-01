import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RecibosChips } from '../recibos-chips';
import type { Recibo, EstadoRecibo } from '@/lib/malla/cristal/recibos';
import type { Medio } from '@/lib/malla/cristal/tipos';

const reciboFalso = (datoId: string, estado: EstadoRecibo, medio: Medio | null = null): Recibo => ({
  datoId,
  tipo: 'mensaje',
  estado,
  medio,
  ruta: [],
  confirmadoPor: null,
  t: Date.now(),
});

afterEach(() => {
  cleanup();
});

describe('montajes de la malla', () => {
  it('pinta una pastilla por cada recibo con su estado y su medio', () => {
    render(
      <>
        <RecibosChips recibo={reciboFalso('dlv-uno', 'recibido', 'servidor')} />
        <RecibosChips recibo={reciboFalso('dlv-dos', 'enviado')} />
      </>,
    );
    expect(document.querySelectorAll('span[aria-label]')).toHaveLength(2);
    expect(screen.getAllByText('Recibido')).toHaveLength(1);
    expect(screen.getAllByText('Enviado')).toHaveLength(1);
    expect(screen.getAllByText('Servidor')).toHaveLength(1);
  });
});
