import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MotorCristalMount, useMotorCristal } from '../motor-cristal-mount';

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

afterEach(() => { cleanup(); });

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
});
