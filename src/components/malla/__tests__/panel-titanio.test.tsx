import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PanelReticula } from '../panel-reticula';
import type { EstadoReticula } from '../panel-reticula';
import { RoutersMallaPanel } from '@/components/network/routers-malla-panel';
import type { Cristal, Medio, NeuronaReticula, Reticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';

// Las dos etiquetas del contrato (§1 «Titanio (Ti⁴⁺) en la sílice»): en la retícula
// la neurona router se enseña como «Ti · router» y, en el panel de routers, al marcar
// «Ya tiene OpenWrt» el router dice «entra en la retícula como titanio».
const AHORA = 1700000000000;

// Panel de la retícula: fabricamos su estado con una neurona normal y una titanio.
const senal = (over: Partial<SenalMedida> = {}): SenalMedida => ({
  de: 'neurona-a', a: 'neurona-b', medio: 'wifi-lan', vistaEn: AHORA,
  rssiDbm: -60, snrDb: 20, rttMs: 10, anchoBandaKbps: 50000, perdidaPct: 1, ...over,
});
const neurona = (id: string, over: Partial<NeuronaReticula> = {}): NeuronaReticula => ({
  id, cuenta: 'cuenta-x', capacidad: { ramGb: 8, bateriaPct: null, cargando: false },
  medios: ['wifi-lan' as Medio], ...over,
});
const tesela = (id: string, esRouter: boolean): Tesela =>
  ({ origen: id, reloj: AHORA, senales: [senal()], neurona: neurona(id, { esRouter }) });
const reticulaDe = (...ts: Tesela[]): Reticula =>
  ({ teselas: Object.fromEntries(ts.map((t) => [t.neurona.id, t])) });
const estadoFabricado = (routers: number): EstadoReticula => ({
  reticula: reticulaDe(
    tesela('neurona-a', false),
    ...Array.from({ length: routers }, (_, i) => tesela(`neurona-ti-${i}`, true)),
  ),
  cristal: {
    puentes: [{ a: 'neurona-a', b: 'neurona-ti-0', medio: 'wifi-lan', coste: 0.2 }],
    estado: 'vitreo', huella: 'ret:1', temperatura: {},
    coordinacion: { 'neurona-a': 1, 'neurona-ti-0': 2 },
  } satisfies Cristal,
  huella: 'abc123456789', vecinosConMismaHuella: 1, ultimaVuelta: AHORA,
});

describe('etiquetas de titanio en la retícula (PanelReticula)', () => {
  afterEach(() => { cleanup(); });
  it('la neurona titanio lleva «Ti · router» con su icono y la línea de qué hace', () => {
    render(<PanelReticula estado={estadoFabricado(1)} />);
    const fila = screen.getByTestId('reticula-coord-neurona-ti-0');
    expect(fila.textContent).toContain('Ti · router');
    expect(fila.textContent).toContain('fija la red: 6 puentes, no se dilata');
    expect(fila.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('1 titanio')).not.toBeNull();
  });
  it('una neurona normal no lleva la etiqueta ni el contador', () => {
    render(<PanelReticula estado={estadoFabricado(0)} />);
    expect(screen.queryByText('Ti · router')).toBeNull();
    expect(screen.queryByText('fija la red: 6 puentes, no se dilata')).toBeNull();
    expect(screen.queryByText(/titanio/)).toBeNull();
  });
  it('el contador de titanios de la cabecera cuenta en plural', () => {
    render(<PanelReticula estado={estadoFabricado(2)} />);
    expect(screen.getByText('2 titanios')).not.toBeNull();
    expect(screen.getAllByText('Ti · router')).toHaveLength(2);
  });
});

describe('etiqueta de titanio en el panel de routers (RoutersMallaPanel)', () => {
  afterEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* sin localStorage: la prueba sigue */ }
  });
  const añadir = () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText('fabricante (p. ej. TP-Link)'), { target: { value: 'TP-Link' } });
    fireEvent.change(screen.getByPlaceholderText('modelo (p. ej. Archer C7)'), { target: { value: 'Archer C7' } });
    fireEvent.click(screen.getByText('Añadir', { exact: true }));
  };
  it('sin marcar OpenWrt no dice que entra en la retícula', () => {
    añadir();
    expect(screen.queryByText('entra en la retícula como titanio')).toBeNull();
  });
  it('al marcar «Ya tiene OpenWrt» el router entra en la retícula como titanio', () => {
    añadir();
    fireEvent.click(screen.getByLabelText('Ya tiene OpenWrt'));
    expect(screen.getByText('entra en la retícula como titanio')).not.toBeNull();
    expect(screen.getByText('Sin troncales definidos para este router.')).not.toBeNull();
  });
});
