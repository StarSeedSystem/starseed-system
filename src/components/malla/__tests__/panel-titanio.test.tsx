import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PanelReticula } from '../panel-reticula';
import type { EstadoReticula } from '../panel-reticula';
import { RoutersMallaPanel } from '../../network/routers-malla-panel';
import type { Cristal, NeuronaReticula, Reticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';

const AHORA = 1700000000000;
const senal = (over: Partial<SenalMedida> = {}): SenalMedida => ({
  de: 'neurona-a', a: 'neurona-b', medio: 'wifi-lan', vistaEn: AHORA,
  rssiDbm: -60, snrDb: 20, rttMs: 10, anchoBandaKbps: 50000, perdidaPct: 1, ...over,
});
const neurona = (id: string, over: Partial<NeuronaReticula> = {}): NeuronaReticula => ({
  id, cuenta: 'cuenta-x',
  capacidad: { ramGb: 8, bateriaPct: null, cargando: false },
  medios: ['wifi-lan', 'wifi-mesh'], ...over,
});
const tesela = (id: string, senales: SenalMedida[], over: Partial<NeuronaReticula> = {}): Tesela =>
  ({ origen: id, reloj: AHORA, senales, neurona: neurona(id, over) });
const reticulaDe = (...ts: Tesela[]): Reticula =>
  ({ teselas: Object.fromEntries(ts.map((t) => [t.neurona.id, t])) });
const cristal = (over: Partial<Cristal> = {}): Cristal => ({
  puentes: [{ a: 'neurona-a', b: 'neurona-b', medio: 'wifi-lan', coste: 0.2 }],
  estado: 'vitreo', temperatura: { 'neurona-a': 0.2, 'neurona-b': 0.4 },
  huella: 'ret:1', coordinacion: {}, ...over,
});
const estadoFabricado = (over: Partial<EstadoReticula> = {}): EstadoReticula => ({
  reticula: reticulaDe(tesela('neurona-a', [senal()]), tesela('neurona-b', [senal()])),
  cristal: cristal(), huella: 'abcdef01fab28239', vecinosConMismaHuella: 1, ultimaVuelta: AHORA, ...over,
});

// Añade un router y, si se pide, lo marca con «Ya tiene OpenWrt».
function añadirRouter(modelo: string, conOpenWrt: boolean): void {
  fireEvent.change(screen.getByPlaceholderText('fabricante (p. ej. TP-Link)'), { target: { value: 'TP-Link' } });
  fireEvent.change(screen.getByPlaceholderText('modelo (p. ej. Archer C7)'), { target: { value: modelo } });
  fireEvent.click(screen.getByText('Añadir'));
  if (conOpenWrt) fireEvent.click(screen.getAllByLabelText('Ya tiene OpenWrt')[0]);
}

// Id del router guardado sacado de la lista del selector de troncales.
function idDeRouterGuardado(indice: number): string {
  const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
  return select.querySelectorAll('option')[indice + 1].value;
}

describe('Etiqueta titanio en la retícula (panel-reticula)', () => {
  afterEach(() => { cleanup(); });

  it('la neurona titanio lleva «Ti · router» y su línea de qué hace', () => {
    const ret = reticulaDe(tesela('neurona-a', [senal()]), tesela('neurona-b', [senal()], { esRouter: true }));
    render(<PanelReticula estado={estadoFabricado({ reticula: ret })} />);
    expect(screen.getByText('Ti · router')).not.toBeNull();
    expect(screen.getByText('fija la red: 6 puentes, no se dilata')).not.toBeNull();
  });

  it('la cabecera dice cuántos titanio hay', () => {
    const ret = reticulaDe(
      tesela('neurona-a', [senal()]),
      tesela('neurona-b', [senal()], { esRouter: true }),
      tesela('neurona-c', [senal()], { esRouter: true }),
    );
    render(<PanelReticula estado={estadoFabricado({ reticula: ret })} />);
    const header = document.querySelector('section[aria-label="Retícula"] header');
    expect(header?.textContent).toContain('2 titanios');
  });

  it('sin titanio no aparece la etiqueta ni el contador', () => {
    render(<PanelReticula estado={estadoFabricado()} />);
    expect(screen.queryByText('Ti · router')).toBeNull();
    expect(screen.queryByText(/titanios?/)).toBeNull();
  });
});

describe('Etiqueta titanio al adoptar un router (routers-malla-panel)', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); });

  it('al marcar «ya tiene OpenWrt», el router dice «entra en la retícula como titanio»', () => {
    render(<RoutersMallaPanel />);
    añadirRouter('Archer C7', false);
    expect(screen.getAllByLabelText('Ya tiene OpenWrt')[0]).not.toBeNull();
    expect(screen.queryByText('entra en la retícula como titanio')).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Ya tiene OpenWrt')[0]);
    expect(screen.getByText('entra en la retícula como titanio')).not.toBeNull();
  });

  it('sin troncales en el plan, lo dice en lugar de montar la tesela', () => {
    render(<RoutersMallaPanel />);
    añadirRouter('Archer C7', true);
    expect(screen.getByText('sin troncales en el plan: añade una y la tesela aparecerá aquí')).not.toBeNull();
  });

  it('con troncales del plan, la tesela del titanio se construye y se muestra', () => {
    render(<RoutersMallaPanel />);
    añadirRouter('Archer C7', true);
    añadirRouter('Archer C9', false);
    const idA = idDeRouterGuardado(0);
    const idB = idDeRouterGuardado(1);
    const [a, b] = screen.getAllByRole('combobox');
    fireEvent.change(a, { target: { value: idA } });
    fireEvent.change(b, { target: { value: idB } });
    fireEvent.click(screen.getByText('Añadir troncal'));
    const tesela = document.querySelector(`[data-testid="tesela-titanio-${idA}"]`);
    expect(tesela?.textContent).toContain('origen: neurona-adoptante');
    expect(tesela?.textContent).toContain(`titanio ${idA}`);
    expect(tesela?.textContent).toContain('wifi-mesh · 5.2 GHz');
  });

  it('la tesela sigue al plan: si la banda de la troncal cambia, cambia la frecuencia', () => {
    render(<RoutersMallaPanel />);
    añadirRouter('Archer C7', true);
    añadirRouter('Archer C9', false);
    const idA = idDeRouterGuardado(0);
    const idB = idDeRouterGuardado(1);
    const [a, b] = screen.getAllByRole('combobox');
    fireEvent.change(a, { target: { value: idA } });
    fireEvent.change(b, { target: { value: idB } });
    fireEvent.click(screen.getByText('Añadir troncal'));
    // Combos del plan de la troncal: 0 par[0] · 1 par[1] · 2 banda.
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '2g' } });
    const tesela = document.querySelector(`[data-testid="tesela-titanio-${idA}"]`);
    expect(tesela?.textContent).toContain('2.4 GHz');
  });
});
