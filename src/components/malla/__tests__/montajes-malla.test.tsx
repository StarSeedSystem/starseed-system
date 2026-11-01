import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EnMarco, preparaDom } from '@/components/dashboard/widgets/_social-d/pruebas/prueba-marco';

preparaDom();

const estado = vi.hoisted(() => ({ recibos: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/consumo/usuario', () => ({ uidActual: async () => 'yo' }));
vi.mock('@/components/mesh/signals-radar', () => ({
  SignalsRadar: () => <div data-testid="radar-senales" />,
}));
vi.mock('@/ai/astraura/mesh', () => ({
  useMeshState: () => ({
    status: 'idle',
    region: 'EU_868',
    nodes: [],
    wifiHealth: { score: 0.9 },
    self: undefined,
  }),
  useNearbyBeacons: () => [],
  useDeliveryReceipts: () => estado.recibos,
  describeBands: () => [
    { id: 'server', label: 'Servidor · nube pública', kind: 'internet', active: true, detail: 'Alcance global', metrics: [], quick: [] },
  ],
  hasRelayKey: () => false,
  applyModemPreset: async () => true,
  recommendPreset: () => ({ presetKey: 'LONG_FAST' }),
  getActiveModemPreset: () => 'UNSET',
  refreshNearbyNow: () => undefined,
  transmit: async () => ({}),
}));

import { InternetRadarWidget } from '@/components/dashboard/widgets/internet-radar-widget';

const reciboFalso = (id: string, resumen: string, status: 'delivered' | 'sent') => ({
  id,
  scope: 'local-group',
  cls: 'P1',
  summary: resumen,
  status,
  hops: [
    { via: 'server', label: 'Servidor', role: 'primary', status: 'confirmed', detail: 'fila creada', through: 'nube', at: 1 },
  ],
  startedAt: 1,
  endedAt: 2,
});

afterEach(() => {
  cleanup();
  estado.recibos = [];
});

describe('recibos de entrega montados en la pantalla de malla', () => {
  it('pinta una fila por cada recibo de entrega (dos recibos falsos → dos filas)', async () => {
    estado.recibos = [
      reciboFalso('dlv-uno', 'Nota de prueba uno', 'delivered'),
      reciboFalso('dlv-dos', 'Nota de prueba dos', 'sent'),
    ];
    render(<EnMarco clase="l"><InternetRadarWidget /></EnMarco>);
    fireEvent.click(await screen.findByRole('button', { name: /Actividad/ }));
    const lista = await screen.findByRole('list', { name: 'Transmisiones recientes' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Nota de prueba uno')).toBeInTheDocument();
    expect(screen.getByText('Entregado')).toBeInTheDocument();
    expect(screen.getByText('Nota de prueba dos')).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.getAllByText(/Servidor/).length).toBeGreaterThanOrEqual(1);
  });

  it('declara su estado vacío cuando aún no hay ningún recibo', async () => {
    render(<EnMarco clase="l"><InternetRadarWidget /></EnMarco>);
    fireEvent.click(await screen.findByRole('button', { name: /Actividad/ }));
    expect(screen.queryByRole('list', { name: 'Transmisiones recientes' })).toBeNull();
    expect(screen.getByText(/Sin transmisiones aún/)).toBeInTheDocument();
  });
});
