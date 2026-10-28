import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PanelReticula } from '../panel-reticula';
import type { EstadoReticula } from '../panel-reticula';
import { calidadSenal } from '@/lib/malla/cristal/coste';
import type { Cristal, EstadoVitreo, Reticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';

const AHORA = 1700000000000;

// Señal medida fabricada entre neurona-a y neurona-b por Wi‑Fi.
const senal = (over: Partial<SenalMedida> = {}): SenalMedida => ({
  de: 'neurona-a', a: 'neurona-b', medio: 'wifi-lan', vistaEn: AHORA,
  rssiDbm: -60, snrDb: 20, rttMs: 10, anchoBandaKbps: 50000, perdidaPct: 1, ...over,
});

const tesela = (id: string, senales: SenalMedida[], router = false): Tesela => ({
  origen: id, reloj: AHORA, senales,
  neurona: {
    id, cuenta: 'cuenta-x',
    ...(router ? { esRouter: true as const } : {}),
    capacidad: { ramGb: 8, bateriaPct: null, cargando: router },
    medios: ['wifi-lan', 'ble'] as const,
  },
});

const reticulaDe = (a: Tesela, b: Tesela): Reticula => ({
  teselas: { 'neurona-a': a, 'neurona-b': b },
});

// Cristal fabricado: un puente Wi‑Fi barato, estado vítreo, temperaturas 0,2/0,4.
const cristal = (over: Partial<Cristal> = {}): Cristal => ({
  puentes: [{ a: 'neurona-a', b: 'neurona-b', medio: 'wifi-lan', coste: 0.2 }],
  estado: 'vitreo', temperatura: { 'neurona-a': 0.2, 'neurona-b': 0.4 },
  huella: 'ret:1', coordinacion: { 'neurona-a': 1, 'neurona-b': 1 }, ...over,
});

const estadoFabricado = (over: Partial<EstadoReticula> = {}): EstadoReticula => ({
  reticula: reticulaDe(tesela('neurona-a', [senal()]), tesela('neurona-b', [senal()])),
  cristal: cristal(), huella: 'abcdef01fab28239', vecinosConMismaHuella: 1, ultimaVuelta: AHORA, ...over,
});

describe('PanelReticula', () => {
  afterEach(() => { cleanup(); });

  it('enseña la cabecera y el estado vítreo en palabras', () => {
    render(<PanelReticula estado={estadoFabricado()} />);
    expect(screen.getByText('Sólido amorfo en tiempo real')).not.toBeNull();
    expect(screen.getByText('vítreo: estable y congelada')).not.toBeNull();
  });

  it.each([
    ['fundido', 'fundido: las señales cambian y la red se recoloca'],
    ['subenfriado', 'subenfriado: la red se asienta y aún puede recolocar puentes'],
  ])('texto del estado %s', (e, texto) => {
    render(<PanelReticula estado={estadoFabricado({ cristal: cristal({ estado: e as EstadoVitreo }) })} />);
    expect(screen.getByText(texto)).not.toBeNull();
  });

  it('enseña la temperatura media al 30 % y una línea de qué significa', () => {
    render(<PanelReticula estado={estadoFabricado()} />);
    expect(screen.getByTestId('reticula-temperatura').textContent).toBe('30 %');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('30');
    expect(screen.getByText(/Fría y estable al 0 %/)).not.toBeNull();
  });

  it('enseña «Misma retícula en 2 de 2 neuronas» con la huella corta', () => {
    render(<PanelReticula estado={estadoFabricado()} />);
    expect(screen.getByText('Misma retícula en 2 de 2 neuronas')).not.toBeNull();
    expect(screen.getByTestId('reticula-huella').textContent).toBe('abcdef01…');
  });

  it('cada puente dice par, medio, calidad y coste', () => {
    render(<PanelReticula estado={estadoFabricado()} />);
    const fila = screen.getByTestId('reticula-puente-0');
    expect(fila.textContent).toContain('neurona-a ↔ neurona-b');
    expect(fila.textContent).toContain('Wi‑Fi');
    expect(fila.textContent).toContain(`calidad ${Math.round(calidadSenal(senal()) * 100)} %`);
    expect(fila.textContent).toContain('coste 0.20');
  });

  it('ordena los puentes por coste', () => {
    const puentes = [
      { a: 'neurona-a', b: 'neurona-b', medio: 'ble' as const, coste: 0.5 },
      { a: 'neurona-a', b: 'neurona-b', medio: 'wifi-lan' as const, coste: 0.2 },
    ];
    const ret = reticulaDe(tesela('neurona-a', [senal(), senal({ medio: 'ble', rssiDbm: -80, snrDb: 2 })]), tesela('neurona-b', []));
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ puentes }) })} />);
    expect(screen.getByTestId('reticula-puente-0').textContent).toContain('coste 0.20');
    expect(screen.getByTestId('reticula-puente-1').textContent).toContain('coste 0.50');
  });

  it('coordinación frente a su máximo (titanio admite 6)', () => {
    const ret = reticulaDe(tesela('neurona-a', [senal()]), tesela('neurona-b', [senal()], true));
    const coord = { 'neurona-a': 1, 'neurona-b': 2 };
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ coordinacion: coord }) })} />);
    expect(screen.getByTestId('reticula-coord-neurona-a').textContent).toContain('1/4');
    expect(screen.getByTestId('reticula-coord-neurona-b').textContent).toContain('2/6');
  });

  it('estado vacío honesto sin señales de otra neurona', () => {
    render(<PanelReticula estado={estadoFabricado({ reticula: { teselas: {} }, cristal: cristal({ puentes: [], coordinacion: {} }) })} />);
    expect(screen.getByText(/aún no llegó ninguna señal/)).not.toBeNull();
    expect(screen.queryByText(/Misma retícula/)).toBeNull();
  });
});
