import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { CLAVE_INTELIGENCIA } from '@/lib/astraura/capas-conciencia';
import { MotorCristalMount, useMotorCristal } from '../motor-cristal-mount';
import { MotorCristalMountDiferido } from '../motor-cristal-mount-diferido';

const observaciones = vi.hoisted(() => ({ suscripciones: 0 }));
vi.mock('@/lib/network/malla-neuronas', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/network/malla-neuronas')>(),
  alCambiarResumenMalla: () => {
    observaciones.suscripciones += 1;
    return () => { observaciones.suscripciones -= 1; };
  },
}));

function SondaReticula() {
  const estado = useMotorCristal();
  return (
    <div>
      <span data-testid="puentes">{estado.cristal.puentes.length}</span>
      <span data-testid="teselas">{Object.keys(estado.reticula.teselas).length}</span>
      <span data-testid="estado">{estado.cristal.estado}</span>
      <span data-testid="huella">{typeof estado.huella}</span>
    </div>
  );
}

afterEach(() => { cleanup(); localStorage.clear(); observaciones.suscripciones = 0; });

describe('MotorCristalMount', () => {
  it('no rompe sin WebRTC ni malla compartida y no pinta nada', () => {
    const { container } = render(<MotorCristalMount />);
    expect(container.firstChild).toBeNull();
    expect(typeof window.RTCPeerConnection).not.toBe('function');
  });

  it('sin motor arrancado, el estado es la retícula vacía honesta', () => {
    render(<SondaReticula />);
    expect(screen.getByTestId('puentes').textContent).toBe('0');
    expect(screen.getByTestId('teselas').textContent).toBe('0');
    expect(['fundido', 'subenfriado', 'vitreo']).toContain(screen.getByTestId('estado').textContent);
    expect(screen.getByTestId('huella').textContent).toBe('string');
  });

  it('el montaje enciende el motor y el estado conserva la forma del panel', () => {
    render(<><MotorCristalMount /><SondaReticula /></>);
    expect(screen.getByTestId('puentes').textContent).toBe('0');
    expect(['fundido', 'subenfriado', 'vitreo']).toContain(screen.getByTestId('estado').textContent);
  });

  it('con la capa de malla apagada no se suscribe a nada', () => {
    localStorage.setItem(CLAVE_INTELIGENCIA, JSON.stringify({ capa158Mesh: false }));
    render(<MotorCristalMount />);
    expect(observaciones.suscripciones).toBe(0);
  });

  it('el montaje diferido del layout carga el motor sin pintar nada', async () => {
    const { container } = render(<MotorCristalMountDiferido />);
    expect(container.firstChild).toBeNull();
    await waitFor(() => expect(observaciones.suscripciones).toBe(1), { timeout: 3000 });
    expect(container.firstChild).toBeNull();
  });
});
