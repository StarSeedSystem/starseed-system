import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PanelReticula } from '../panel-reticula';
import type { EstadoReticula } from '../panel-reticula';
import { calidadSenal } from '@/lib/malla/cristal/coste';
import type { Cristal, EstadoVitreo, Medio, NeuronaReticula, Reticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';
const AHORA = 1700000000000;
const MEDIOS: Medio[] = ['wifi-lan', 'ble'];
// Señal medida fabricada entre neurona-a y neurona-b por Wi‑Fi.
const senal = (over: Partial<SenalMedida> = {}): SenalMedida => ({
  de: 'neurona-a', a: 'neurona-b', medio: 'wifi-lan', vistaEn: AHORA,
  rssiDbm: -60, snrDb: 20, rttMs: 10, anchoBandaKbps: 50000, perdidaPct: 1, ...over,
});
// Neurona fabricada; `over` permite hacerla titanio (router) o cambiar su batería.
const neurona = (id: string, over: Partial<NeuronaReticula> = {}): NeuronaReticula => ({
  id, cuenta: 'cuenta-x', capacidad: { ramGb: 8, bateriaPct: null, cargando: false }, medios: MEDIOS, ...over,
});
const tesela = (id: string, senales: SenalMedida[], over: Partial<NeuronaReticula> = {}): Tesela =>
  ({ origen: id, reloj: AHORA, senales, neurona: neurona(id, over) });
const reticulaDe = (...ts: Tesela[]): Reticula =>
  ({ teselas: Object.fromEntries(ts.map((t) => [t.neurona.id, t])) });
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
    const ret = reticulaDe(tesela('neurona-a', [senal()]), tesela('neurona-b', [senal()], { esRouter: true }));
    const coord = { 'neurona-a': 1, 'neurona-b': 2 };
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ coordinacion: coord }) })} />);
    expect(screen.getByTestId('reticula-coord-neurona-a').textContent).toContain('1/4');
    expect(screen.getByTestId('reticula-coord-neurona-b').textContent).toContain('2/6');
  });
  it('sin señal medida del medio, la calidad se enseña como —', () => {
    const ret = reticulaDe(tesela('neurona-a', []), tesela('neurona-b', []));
    render(<PanelReticula estado={estadoFabricado({ reticula: ret })} />);
    expect(screen.getByTestId('reticula-puente-0').textContent).toContain('calidad —');
  });
  it('usa la señal medida en sentido inverso (de b a a)', () => {
    const inversa = senal({ de: 'neurona-b', a: 'neurona-a' });
    const ret = reticulaDe(tesela('neurona-a', [inversa]), tesela('neurona-b', []));
    render(<PanelReticula estado={estadoFabricado({ reticula: ret })} />);
    const pct = Math.round(calidadSenal(senal()) * 100);
    expect(screen.getByTestId('reticula-puente-0').textContent).toContain(`calidad ${pct} %`);
  });
  it('huella corta sin recortar y huella vacía como —', () => {
    const { rerender } = render(<PanelReticula estado={estadoFabricado({ huella: 'abc123' })} />);
    expect(screen.getByTestId('reticula-huella').textContent).toBe('abc123');
    rerender(<PanelReticula estado={estadoFabricado({ huella: '' })} />);
    expect(screen.getByTestId('reticula-huella').textContent).toBe('—');
  });
  it('coordinación 0 cuando el cristal no trae el dato', () => {
    render(<PanelReticula estado={estadoFabricado({ cristal: cristal({ coordinacion: {} }) })} />);
    expect(screen.getByTestId('reticula-coord-neurona-a').textContent).toContain('0/4');
  });
  it.each([[null, 6], [60, 6], [30, 4], [10, 3]])('titanio con batería %s admite %i puentes', (bateria, max) => {
    const cap = { ramGb: 8, bateriaPct: bateria, cargando: false };
    const ret = reticulaDe(tesela('neurona-b', [], { esRouter: true, capacidad: cap }));
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ coordinacion: {} }) })} />);
    expect(screen.getByTestId('reticula-coord-neurona-b').textContent).toContain(`0/${max}`);
  });
  it('estado vacío honesto sin señales de otra neurona', () => {
    render(<PanelReticula estado={estadoFabricado({ reticula: { teselas: {} }, cristal: cristal({ puentes: [], coordinacion: {} }) })} />);
    expect(screen.getByText(/aún no llegó ninguna señal/)).not.toBeNull();
    expect(screen.queryByText(/Misma retícula/)).toBeNull();
  });

  it('etiqueta Ti · router con icono para neuronas titanio', () => {
    const ret = reticulaDe(
      tesela('neurona-a', [senal()]),
      tesela('neurona-b', [senal()], { esRouter: true })
    );
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ coordinacion: {} }) })} />);
    expect(screen.getByText('Ti · router')).not.toBeNull();
    const svgIcon = document.querySelector('svg.h-3.w-3.text-amber-500');
    expect(svgIcon).not.toBeNull();
  });

  it('línea explicativa «fija la red: 6 puentes, no se dilata» para titanio', () => {
    const ret = reticulaDe(
      tesela('neurona-a', [senal()]),
      tesela('neurona-b', [senal()], { esRouter: true })
    );
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ coordinacion: {} }) })} />);
    expect(screen.getByText('fija la red: 6 puentes, no se dilata')).not.toBeNull();
  });

  it('cabecera muestra contador de titanios', () => {
    const ret = reticulaDe(
      tesela('neurona-a', [senal()]),
      tesela('neurona-b', [senal()], { esRouter: true }),
      tesela('neurona-c', [senal()], { esRouter: true })
    );
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ coordinacion: {} }) })} />);
    const sections = document.querySelectorAll('section[aria-label="Retícula"]');
    const headerText = sections[0]?.querySelector('header')?.textContent;
    expect(headerText).toContain('2 titanios');
  });

  it('icono Router en cabecera cuando hay titanios', () => {
    const ret = reticulaDe(tesela('neurona-a', [senal()]), tesela('neurona-b', [senal()], { esRouter: true }));
    render(<PanelReticula estado={estadoFabricado({ reticula: ret, cristal: cristal({ coordinacion: {} }) })} />);
    const header = document.querySelector('section[aria-label="Retícula"] header');
    // Selector de atributo: el nombre de clase «h-3.5» lleva puntos y no vale como clase CSS.
    expect(header?.querySelector('svg[class~="h-3.5"]')).not.toBeNull();
  });

  it('sin titanios no muestra etiqueta ni contador', () => {
    render(<PanelReticula estado={estadoFabricado()} />);
    expect(screen.queryByText('Ti · router')).toBeNull();
    expect(screen.queryByText('titanio')).toBeNull();
  });
});
