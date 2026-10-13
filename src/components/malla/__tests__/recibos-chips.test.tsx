import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RecibosChips } from '../recibos-chips';
import type { Recibo, EstadoRecibo } from '@/lib/malla/cristal/recibos';
import type { Medio } from '@/lib/malla/cristal/tipos';

const crearRecibo = (overrides: Partial<Recibo>): Recibo => {
  const base: Recibo = {
    datoId: '123',
    tipo: 'mensaje',
    estado: 'preparado',
    medio: null,
    ruta: [],
    confirmadoPor: null,
    t: Date.now(),
  };
  return { ...base, ...overrides };
};

afterEach(() => {
    cleanup();
});

describe('RecibosChips', () => {
  it.each([
    ['preparado', 'Preparado'],
    ['enviado', 'Enviado'],
    ['recibido', 'Recibido'],
    ['leido', 'Leído'],
    ['publicado', 'Publicado'],
    ['propagado', 'Propagado'],
    ['llamando', 'Llamando'],
    ['en-directo', 'En directo'],
    ['terminada', 'Terminada'],
    ['fallido', 'Fallido'],
  ])('shows correct text for estado %s', (estado, expectedText) => {
    const recibo = crearRecibo({ estado: estado as EstadoRecibo });
    render(<RecibosChips recibo={recibo} />);
    const texto = screen.queryByText(expectedText);
    expect(texto).not.toBeNull();
  });

  it('shows LoRa when medio is lora', () => {
    const recibo = crearRecibo({ medio: 'lora' as Medio });
    render(<RecibosChips recibo={recibo} />);
    const elemento = screen.queryByText('LoRa');
    expect(elemento).not.toBeNull();
  });

  it('shows BLE when medio is ble', () => {
    const recibo = crearRecibo({ medio: 'ble' as Medio });
    render(<RecibosChips recibo={recibo} />);
    const elemento = screen.queryByText('BLE');
    expect(elemento).not.toBeNull();
  });

  it('shows Wi‑Fi when medio is wifi-lan', () => {
    const recibo = crearRecibo({ medio: 'wifi-lan' as Medio });
    render(<RecibosChips recibo={recibo} />);
    const elemento = screen.queryByText('Wi‑Fi');
    expect(elemento).not.toBeNull();
  });

  it('shows WebRTC when medio is webrtc', () => {
    const recibo = crearRecibo({ medio: 'webrtc' as Medio });
    render(<RecibosChips recibo={recibo} />);
    const elemento = screen.queryByText('WebRTC');
    expect(elemento).not.toBeNull();
  });

  it('shows malla Wi‑Fi when medio is wifi-mesh', () => {
    const recibo = crearRecibo({ medio: 'wifi-mesh' as Medio });
    render(<RecibosChips recibo={recibo} />);
    const elemento = screen.queryByText('malla Wi‑Fi');
    expect(elemento).not.toBeNull();
  });

  it('shows correct aria-label with medio y ruta', () => {
    const recibo = crearRecibo({
      medio: 'wifi-lan' as Medio,
      ruta: ['tablet', 'Mac'],
    });
    render(<RecibosChips recibo={recibo} />);
    const elementoTexto = screen.getByText('Wi‑Fi');
    expect(elementoTexto).not.toBeNull();
    const elementoOuter = elementoTexto.parentElement as HTMLElement;
    expect(elementoOuter).not.toBeNull();
    expect(elementoOuter.getAttribute('aria-label')).toBe('por Wi‑Fi: tablet → Mac');
  });

  it('shows correct aria-label cuando medio es nulo', () => {
    const recibo = crearRecibo({ medio: null, ruta: [] });
    render(<RecibosChips recibo={recibo} />);
    const elementoTexto = screen.getByText('Preparado');
    expect(elementoTexto).not.toBeNull();
    const elementoOuter = elementoTexto.parentElement as HTMLElement;
    expect(elementoOuter).not.toBeNull();
    expect(elementoOuter.getAttribute('aria-label')).toBe('estado: Preparado');
  });

  it('shows correct aria-label cuando ruta está vacía pero medio está presente', () => {
    const recibo = crearRecibo({ medio: 'ble' as Medio, ruta: [] });
    render(<RecibosChips recibo={recibo} />);
    const elementoTexto = screen.getByText('BLE');
    expect(elementoTexto).not.toBeNull();
    const elementoOuter = elementoTexto.parentElement as HTMLElement;
    expect(elementoOuter).not.toBeNull();
    expect(elementoOuter.getAttribute('aria-label')).toBe('por BLE: ');
  });
});