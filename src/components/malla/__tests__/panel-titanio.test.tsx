// Pruebas jsdom de las dos etiquetas de titanio (MC1013TC):
// 1) PanelReticula: «Ti · router» con su explicación y el contador en cabecera.
// 2) RoutersMallaPanel: «entra en la retícula como titanio» y la tesela
//    construida con teselaDeRouter desde las troncales del plan, sin red.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PanelReticula } from '../panel-reticula';
import type { EstadoReticula } from '../panel-reticula';
import { RoutersMallaPanel } from '../../network/routers-malla-panel';
import type { Cristal, Medio, NeuronaReticula, Reticula, Tesela } from '@/lib/malla/cristal/tipos';

const AHORA = 1700000000000;
const MEDIOS: Medio[] = ['wifi-lan', 'wifi-mesh'];

const neurona = (id: string, over: Partial<NeuronaReticula> = {}): NeuronaReticula => ({
  id, cuenta: 'cuenta-x', capacidad: { ramGb: 8, bateriaPct: null, cargando: false }, medios: MEDIOS, ...over,
});

const tesela = (id: string, over: Partial<NeuronaReticula> = {}): Tesela =>
  ({ origen: id, reloj: AHORA, neurona: neurona(id, over), senales: [] });

const reticulaDe = (...ts: Tesela[]): Reticula =>
  ({ teselas: Object.fromEntries(ts.map((t) => [t.neurona.id, t])) });

const cristal = (over: Partial<Cristal> = {}): Cristal => ({
  puentes: [{ a: 'neurona-a', b: 'titanio-1', medio: 'wifi-mesh', coste: 0.3 }],
  estado: 'vitreo', temperatura: {}, huella: 'ret:1', coordinacion: {}, ...over,
});

const estadoFabricado = (over: Partial<EstadoReticula> = {}): EstadoReticula => ({
  reticula: reticulaDe(tesela('neurona-a'), tesela('titanio-1', { esRouter: true })),
  cristal: cristal(), huella: 'abcdef01fab28239', vecinosConMismaHuella: 1, ultimaVuelta: AHORA, ...over,
});

afterEach(() => {
  cleanup();
  try { localStorage.clear(); } catch { /* noop */ }
});

describe('PanelReticula · titanio', () => {
  it('la neurona titanio lleva «Ti · router» y la línea de qué hace', () => {
    const coord = { 'titanio-1': 2 };
    render(<PanelReticula estado={estadoFabricado({ cristal: cristal({ coordinacion: coord }) })} />);
    expect(screen.getByText('Ti · router')).not.toBeNull();
    expect(screen.getByText('fija la red: 6 puentes, no se dilata')).not.toBeNull();
  });

  it('la cabecera dice cuántos titanio hay (1 y varios)', () => {
    const { rerender } = render(
      <PanelReticula estado={estadoFabricado({ cristal: cristal({ coordinacion: { 'titanio-1': 1 } }) })} />,
    );
    expect(screen.getByTestId('reticula-titanios').textContent).toBe('1 titanio');
    rerender(
      <PanelReticula
        estado={estadoFabricado({
          reticula: reticulaDe(tesela('titanio-1', { esRouter: true }), tesela('titanio-2', { esRouter: true })),
          cristal: cristal({ coordinacion: { 'titanio-1': 1, 'titanio-2': 1 } }),
        })}
      />,
    );
    expect(screen.getByTestId('reticula-titanios').textContent).toBe('2 titanios');
  });

  it('una neurona normal no lleva la etiqueta titanio', () => {
    render(<PanelReticula estado={estadoFabricado({
      reticula: reticulaDe(tesela('neurona-a')),
      cristal: cristal({ coordinacion: { 'neurona-a': 1 } }),
    })} />);
    expect(screen.queryByTestId('reticula-ti-neurona-a')).toBeNull();
    expect(screen.queryByTestId('reticula-titanios')).toBeNull();
  });
});

const añadirRouter = (fabricante: string, modelo: string) => {
  fireEvent.change(screen.getByPlaceholderText('fabricante (p. ej. TP-Link)'), { target: { value: fabricante } });
  fireEvent.change(screen.getByPlaceholderText('modelo (p. ej. Archer C7)'), { target: { value: modelo } });
  fireEvent.click(screen.getByText('Añadir', { exact: true }));
};

describe('RoutersMallaPanel · titanio', () => {
  it('al marcar «ya tiene OpenWrt» el router entra como titanio y su tesela se construye sin red', () => {
    render(<RoutersMallaPanel />);
    expect(screen.queryByText('entra en la retícula como titanio')).toBeNull();
    añadirRouter('TP-Link', 'Archer C7');
    añadirRouter('Xiaomi', 'Mi Router 4A');
    // Casillas en orden: la del operador (form) y una por router; marcamos la primera.
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(screen.getByText('entra en la retícula como titanio')).not.toBeNull();
    const teselas = document.querySelectorAll('[data-testid^="tesela-titanio-"]');
    expect(teselas).toHaveLength(1);
    expect(teselas[0].textContent).toContain('origen local');
    expect(teselas[0].textContent).toContain('0 señales');
    expect(document.querySelectorAll('[data-testid^="router-titanio-"]')).toHaveLength(1);
  });

  it('la tesela sale de las troncales del plan: una troncal, una señal por cada extremo', () => {
    render(<RoutersMallaPanel />);
    añadirRouter('TP-Link', 'Archer C7');
    añadirRouter('Xiaomi', 'Mi Router 4A');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getAllByRole('checkbox')[2]);
    const sel = screen.getAllByRole('combobox');
    const opA = Array.from(sel[0].querySelectorAll('option')).find((o) => (o.textContent ?? '').includes('TP-Link'));
    const opB = Array.from(sel[1].querySelectorAll('option')).find((o) => (o.textContent ?? '').includes('Xiaomi'));
    fireEvent.change(sel[0], { target: { value: opA?.value } });
    fireEvent.change(sel[1], { target: { value: opB?.value } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir troncal' }));
    const teselas = document.querySelectorAll('[data-testid^="tesela-titanio-"]');
    expect(teselas).toHaveLength(2);
    expect(teselas[0].textContent).toContain('1 señal');
    expect(teselas[1].textContent).toContain('1 señal');
  });
});
