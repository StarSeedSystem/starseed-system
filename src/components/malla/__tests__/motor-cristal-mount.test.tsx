import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MotorCristalMount, useMotorCristal } from '../motor-cristal-mount';
import React from 'react';

// Mock all dependencies at module level
vi.mock('@/lib/network/identidad-dispositivo', () => ({
  identidadDispositivo: () => ({
    meshDeviceId: 'mesh-123',
    neuronDeviceId: 'neuron-123',
    syncDeviceId: 'sync-123',
  }),
}));

vi.mock('@/lib/network/malla-neuronas', () => ({
  usePeersMalla: () => ({ pares: [] }),
}));

vi.mock('@/lib/nativa/puente', () => ({
  esAppNativa: () => false,
}));

vi.mock('@/ai/astraura/mesh', () => ({
  getMeshState: () => ({ self: { id: 'self-123' }, nodes: [] }),
}));

vi.mock('@/lib/malla/cristal/medidas-locales', () => ({
  senalesDeNodosMesh: () => [],
  senalesDeEnlacesLocales: () => [],
}));

vi.mock('@/ai/astraura/mesh/mesh-identity', () => ({
  signContent: vi.fn().mockResolvedValue(null),
  verifyContent: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/ai/astraura/mesh/logical-clock', () => ({
  tick: () => 1,
}));

vi.mock('@/lib/network/lan-sync', () => ({
  getSharedMesh: () => null,
}));

vi.mock('@/lib/network/vinculos-entre-cuentas', () => ({
  enviarAPar: vi.fn(),
  vinculosActivos: () => [],
}));

vi.mock('@/lib/network/bucle-fondo', () => ({
  crearBucle: vi.fn(() => () => {}),
}));

describe('MotorCristalMount', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('crea el motor sin romper sin WebRTC ni identidad (degrada a vacío)', () => {
    function TestComponent() {
      const motor = useMotorCristal();
      return <div data-testid="motor-keys">{Object.keys(motor).join(',')}</div>;
    }
    const { getByTestId } = render(<TestComponent />);
    const keys = getByTestId('motor-keys').textContent ?? '';
    expect(keys).toContain('vuelta');
    expect(keys).toContain('recibir');
    expect(keys).toContain('intervaloMs');
    expect(keys).toContain('estado');
    expect(keys).toContain('suscribir');
  });

  it('useMotorCristal devuelve un motor con estado()', () => {
    function TestComponent() {
      const motor = useMotorCristal();
      const estado = motor.estado();
      return <div data-testid="estado">{JSON.stringify(estado)}</div>;
    }
    const { getByTestId } = render(<TestComponent />);
    const estado = JSON.parse(getByTestId('estado').textContent ?? '{}');
    expect(estado).toHaveProperty('reticula');
    expect(estado).toHaveProperty('cristal');
    expect(estado).toHaveProperty('huella');
    expect(estado).toHaveProperty('vecinosConMismaHuella');
    expect(estado).toHaveProperty('ultimaVuelta');
  });

  it('motor.vuelta() no lanza aunque falle la medición', async () => {
    function TestComponent() {
      const motor = useMotorCristal();
      const [error, setError] = React.useState<string | null>(null);
      React.useEffect(() => {
        motor.vuelta().catch((e) => setError(e.message));
      }, [motor]);
      return <div data-testid="error">{error ?? 'ok'}</div>;
    }
    const { getByTestId } = render(<TestComponent />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(getByTestId('error').textContent).toBe('ok');
  });
});