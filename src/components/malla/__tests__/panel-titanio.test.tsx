// @vitest-environment jsdom
/**
 * Titanio en la retícula (fila «Titanio (Ti⁴⁺) en la sílice» de §1 de malla-cristalina-sio2.md):
 * la etiqueta «Ti · router» del panel de la retícula y el «entra en la retícula como
 * titanio» del panel de routers, con su tesela construida sin red.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PanelReticula, type EstadoReticula } from '../panel-reticula';
import { RoutersMallaPanel, teselaRouterMalla } from '@/components/network/routers-malla-panel';
import type { Cristal, NeuronaReticula, Reticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';

const AHORA = 1700000000000;
const senal = (): SenalMedida => ({ de: 'n-a', a: 'n-b', medio: 'wifi-lan', vistaEn: AHORA, rssiDbm: -60, snrDb: 20 });
const neurona = (id: string, ti: boolean): NeuronaReticula => ({
  id, cuenta: 'cuenta-x',
  ...(ti ? { esRouter: true } : {}),
  capacidad: { ramGb: 8, bateriaPct: null, cargando: false }, medios: ['wifi-lan', 'wifi-mesh'],
});
const teselaDe = (id: string, ti: boolean): Tesela =>
  ({ origen: id, reloj: AHORA, neurona: neurona(id, ti), senales: [senal()] });
const reticulaDe = (...ts: Tesela[]): Reticula =>
  ({ teselas: Object.fromEntries(ts.map((t) => [t.neurona.id, t])) });
const estadoDe = (...ts: Tesela[]): EstadoReticula => ({
  reticula: reticulaDe(...ts),
  cristal: ({
    puentes: ts.length > 1
      ? [{ a: ts[0].neurona.id, b: ts[1].neurona.id, medio: 'wifi-lan' as const, coste: 0.2 }]
      : [{ a: ts[0]?.neurona.id ?? 'x', b: ts[0]?.neurona.id ?? 'y', medio: 'wifi-lan' as const, coste: 0.2 }],
    estado: 'vitreo', temperatura: {}, huella: 'ret:1',
    coordinacion: Object.fromEntries(ts.map((t) => [t.neurona.id, 0])),
  }) as Cristal,
  huella: 'abcdef01fab28239', vecinosConMismaHuella: 1, ultimaVuelta: AHORA,
});

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* noop */ } });

describe('PanelReticula · titanio', () => {
  it('la neurona titanio lleva «Ti · router» y su línea de qué hace', () => {
    render(<PanelReticula estado={estadoDe(teselaDe('n-a', false), teselaDe('rt-1', true))} />);
    expect(screen.getByText('Ti · router')).not.toBeNull();
    expect(screen.getAllByText('fija la red: 6 puentes, no se dilata')).toHaveLength(1);
  });

  it('una neurona que no es router no lleva la etiqueta ni la línea', () => {
    render(<PanelReticula estado={estadoDe(teselaDe('n-a', false), teselaDe('n-b', false))} />);
    expect(screen.queryByText('Ti · router')).toBeNull();
    expect(screen.queryByText(/no se dilata/)).toBeNull();
  });

  it('la cabecera dice cuántos titanio hay', () => {
    const { rerender } = render(<PanelReticula estado={estadoDe(teselaDe('n-a', false), teselaDe('rt-1', true))} />);
    expect(screen.getByTestId('reticula-titanios').textContent).toBe('1 titanio');
    rerender(<PanelReticula estado={estadoDe(teselaDe('rt-1', true), teselaDe('rt-2', true))} />);
    expect(screen.getByTestId('reticula-titanios').textContent).toBe('2 titanios');
  });
});

describe('RoutersMallaPanel · titanio', () => {
  const añadir = (fabricante: string, modelo: string) => {
    fireEvent.change(screen.getByPlaceholderText('fabricante (p. ej. TP-Link)'), { target: { value: fabricante } });
    fireEvent.change(screen.getByPlaceholderText('modelo (p. ej. Archer C7)'), { target: { value: modelo } });
    fireEvent.click(screen.getByText('Añadir', { exact: true }));
  };

  it('al marcar «ya tiene OpenWrt», el router dice «entra en la retícula como titanio»', () => {
    render(<RoutersMallaPanel />);
    añadir('TP-Link', 'Archer C7');
    expect(screen.queryByText(/entra en la retícula como titanio/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Ya tiene OpenWrt'));
    expect(screen.getByText(/entra en la retícula como titanio/)).not.toBeNull();
    expect(screen.getByText(/tesela aún sin troncales del plan/)).not.toBeNull();
  });

  it('con troncales del plan, la tesela del titanio cuenta sus señales', () => {
    render(<RoutersMallaPanel />);
    añadir('TP-Link', 'C7 A');
    añadir('TP-Link', 'C7 B');
    fireEvent.click(screen.getAllByLabelText('Ya tiene OpenWrt')[0]);
    fireEvent.click(screen.getAllByLabelText('Ya tiene OpenWrt')[1]);
    const [primero, segundo] = screen.getAllByRole('combobox');
    const valorDe = (combo: HTMLElement, nombre: string): string =>
      Array.from(combo.querySelectorAll('option')).find((o) => o.textContent?.trim() === nombre)?.getAttribute('value') ?? '';
    fireEvent.change(primero, { target: { value: valorDe(primero, 'TP-Link C7 A') } });
    fireEvent.change(segundo, { target: { value: valorDe(segundo, 'TP-Link C7 B') } });
    fireEvent.click(screen.getByText('Añadir troncal'));
    expect(screen.getAllByText(/tesela: 1 señal de troncal/)).toHaveLength(2);
  });

  it('teselaRouterMalla construye la tesela sin red desde el plan', () => {
    const r = { id: 'rt-x', fabricante: 'TP-Link', modelo: 'C7', deOperador: false, openwrt: true };
    const plan = [
      { a: 'rt-x', b: 'rt-y', banda: '5g' as const, canal: 36, anchoMhz: 80, pireDbm: 23 },
      { a: 'otro', b: 'circulo', banda: '5g' as const, canal: 36, anchoMhz: 80, pireDbm: 23 },
    ];
    const t = teselaRouterMalla(r, plan, 'ES');
    expect(t.origen).toBe('neurona-local');
    expect(t.reloj).toBe(0);
    expect(t.neurona.esRouter).toBe(true);
    expect(t.neurona.medios).toEqual(['wifi-mesh']);
    expect(t.senales).toHaveLength(1);
    expect(t.senales[0].de).toBe('rt-x');
    expect(t.senales[0].a).toBe('rt-y');
    expect(t.senales[0].medio).toBe('wifi-mesh');
    expect(typeof t.senales[0].frecuenciaMhz).toBe('number');
    expect(t.senales[0].anchoCanalMhz).toBe(80);
  });
});
