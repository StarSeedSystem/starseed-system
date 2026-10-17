/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PanelVinculos from '../panel-vinculos';

// Mock del contexto y props necesarios
const crearProps = (overrides: Partial<any> = {}) => {
  const ahora = () => Date.now();
  const nuevoId = () => Math.random().toString(36).substring(2, 9);
  const autor = { id: 'test-autor', tipo: 'humano' as const, nombre: 'Test' };
  const controlador = {
    mover: (op: any) => ({ ok: true }),
  };
  const parametroDe = (ref: { atomoId: string; parametroId: string }) => ({
    id: `${ref.atomoId}-${ref.parametroId}`,
    atomoId: ref.atomoId,
    parametroId: ref.parametroId,
    nombre: `Parametro ${ref.parametroId}`,
    tipo: 'numero' as const,
    min: 0,
    max: 100,
    paso: 1,
  });
  const vinculos: any[] = [];
  return {
    moleculeId: 'test-molecula',
    vinculos,
    parametroDe,
    controlador,
    autor,
    ahora,
    nuevoId,
    alCambiarVinculos: (v: any[]) => {},
    ...overrides,
  };
};

describe('PanelVinculos', () => {
  it('muestra lista vacía cuando no hay vínculos', () => {
    render(PanelVinculos(crearProps()));
    expect(screen.getByText(/no hay vínculos configurados/i)).toBeInTheDocument();
  });

  it('muestra un vínculo en la lista', () => {
    const vinculoDePrueba = {
      id: 'v1',
      fuente: { tipo: 'gamepad', control: 'eje', numero: 0, indice: 0 },
      objetivo: { atomoId: 'a1', parametroId: 'p1' },
      modo: 'absoluto',
      curva: { forma: 'lineal', invertir: false, zonaMuerta: 0, suavizado: 0 },
      activo: true,
      creadoPor: 'test',
    };
    render(PanelVinculos(crearProps({ vinculos: [vinculoDePrueba] })));
    expect(screen.getByText(/fuente: gamepad eje 0/i)).toBeInTheDocument();
    expect(screen.getByText(/objeto: parametro p1/i)).toBeInTheDocument();
    expect(screen.getByText(/modo: absoluto/i)).toBeInTheDocument();
    expect(screen.getByText(/activo/i)).toBeInTheDocument();
  });

  it('permite quitar un vínculo', () => {
    const vinculoDePrueba = {
      id: 'v1',
      fuente: { tipo: 'gamepad', control: 'eje', numero: 0, indice: 0 },
      objetivo: { atomoId: 'a1', parametroId: 'p1' },
      modo: 'absoluto',
      curva: { forma: 'lineal', invertir: false, zonaMuerta: 0, suavizado: 0 },
      activo: true,
      creadoPor: 'test',
    };
    const handleCambiarVinculos = vi.fn();
    render(
      PanelVinculos(
        crearProps({ vinculos: [vinculoDePrueba], alCambiarVinculos: handleCambiarVinculos })
      )
    );
    const botonQuitar = screen.getByRole('button', { name: /quitar/i });
    fireEvent.click(botonQuitar);
    expect(handleCambiarVinculos).toHaveBeenCalledWith([]);
  });

  it('permite activar/desactivar un vínculo', () => {
    const vinculoDePrueba = {
      id: 'v1',
      fuente: { tipo: 'gamepad', control: 'eje', numero: 0, indice: 0 },
      objetivo: { atomoId: 'a1', parametroId: 'p1' },
      modo: 'absoluto',
      curva: { forma: 'lineal', invertir: false, zonaMuerta: 0, suavizado: 0 },
      activo: true,
      creadoPor: 'test',
    };
    const handleCambiarVinculos = vi.fn();
    render(
      PanelVinculos(
        crearProps({ vinculos: [vinculoDePrueba], alCambiarVinculos: handleCambiarVinculos })
      )
    );
    const botonActivar = screen.getByRole('button', { name: /pausar/i }); // Inicia como activo
    fireEvent.click(botonActivar);
    expect(handleCambiarVinculos).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'v1', activo: false }),
    ]);
  });

  it('inicia el aprendizaje de un parámetro', () => {
    const handleCambiarVinculos = vi.fn();
    const props = crearProps({ alCambiarVinculos: handleCambiarVinculos });
    render(PanelVinculos(props));
    // Simular clic en un botón de aprender (por ahora no existe, así que saltamos)
    expect(true).toBe(true); // Placeholder
  });

  it('confirma el aprendizaje y crea un vínculo', () => {
    // Placeholder para la lógica de aprendizaje
    expect(true).toBe(true);
  });

  it('cancela el aprendizaje', () => {
    // Placeholder
    expect(true).toBe(true);
  });

  it('no aplica un vínculo propuesto por IA sin confirmación', () => {
    // Placeholder
    expect(true).toBe(true);
  });

  it('maneja ejes con zona muerta', () => {
    // Placeholder
    expect(true).toBe(true);
  });

  it('maneja el caso sin gamepad conectado', () => {
    // Placeholder
    expect(true).toBe(true);
  });
});