import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PanelReticula, textoEstadoVitreo, calidadPuente, huellaCorta, sentidoTemperatura } from '../panel-reticula';
import type { EstadoReticula } from '../panel-reticula';
import type { Reticula, Cristal } from '@/lib/malla/cristal/tipos';

const cristal: Cristal = {
  puentes: [
    { a: 'n2', b: 'n3', medio: 'ble', coste: 0.5 },
    { a: 'n1', b: 'n2', medio: 'wifi-lan', coste: 0.1 },
  ],
  estado: 'subenfriado',
  temperatura: { n1: 0.4, n2: 0.2 },
  huella: 'abcdef12gpucho34',
  coordinacion: { n1: 1, n2: 2, n3: 1 },
};

const estado: EstadoReticula = {
  reticula: {
    teselas: {
      n1: { origen: 'n1', reloj: 1, neurona: { id: 'n1', cuenta: 'c', capacidad: { ramGb: 8, bateriaPct: null, cargando: false }, medios: ['wifi-lan'] }, senales: [] },
      n2: { origen: 'n2', reloj: 2, neurona: { id: 'n2', cuenta: 'c', capacidad: { ramGb: 8, bateriaPct: null, cargando: false }, medios: ['wifi-lan'] }, senales: [] },
    },
  },
  cristal,
  huella: 'abcdef12gpucho34',
  vecinosConMismaHuella: 1,
  ultimaVuelta: 0,
};

const vacio: EstadoReticula = { ...estado, reticula: { teselas: {} } };

describe('PanelReticula', () => {
  it('muestra el estado vacío honesto sin teselas', () => {
    render(<PanelReticula estado={vacio} />);
    expect(screen.getByText(/aún no llegó ninguna señal de otra neurona/i)).toBeTruthy();
  });

  it('pinta cabecera, estado en palabras y temperatura', () => {
    render(<PanelReticula estado={estado} />);
    expect(screen.getByText('Sólido amorfo en tiempo real')).toBeTruthy();
    expect(screen.getByText(/subenfriado/i)).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('enseña misma retícula en N de M con huella corta', () => {
    render(<PanelReticula estado={estado} />);
    expect(screen.getByText('Misma retícula en 2 de 2 neuronas')).toBeTruthy();
    expect(screen.getByText('abcdef12')).toBeTruthy();
  });

  it('lista los puentes ordenados por coste', () => {
    render(<PanelReticula estado={estado} />);
    const lista = screen.getByLabelText('Puentes');
    const items = Array.from(lista.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(items[0]).toContain('n1');
    expect(items[0]).toContain('90 %');
    expect(screen.getByText('coste 0.10')).toBeTruthy();
  });

  it('muestra la coordinación frente a su máximo', () => {
    render(<PanelReticula estado={estado} />);
    expect(screen.getByText(/n1: 1 de 4 puentes/)).toBeTruthy();
    expect(screen.getByText(/n2: 2 de 4 puentes/)).toBeTruthy();
  });
});

afterEach(cleanup);

describe('helpers puros', () => {
  it('textoEstadoVitreo cubre los tres estados', () => {
    expect(textoEstadoVitreo('fundido')).toContain('las señales cambian');
    expect(textoEstadoVitreo('vitreo')).toContain('estable y congelada');
    expect(textoEstadoVitreo('subenfriado')).toContain('asentando');
  });

  it('calidadPuente acota el coste a 0–100', () => {
    expect(calidadPuente(0.1)).toBe(90);
    expect(calidadPuente(1.2)).toBe(0);
    expect(calidadPuente(-0.2)).toBe(100);
  });

  it('huellaCorta y sentidoTemperatura', () => {
    expect(huellaCorta('abcdef123456')).toBe('abcdef12');
    expect(sentidoTemperatura(0.7)).toContain('recolocan');
    expect(sentidoTemperatura(0.1)).toContain('congelan');
  });
});
