import { describe, it, expect } from 'vitest';
import { construirCatalogo } from '../catalogo-shaders';

describe('construirCatalogo', () => {
  it('agrupa por categoría y marca propiedades correctamente', () => {
    const registro = [
      {
        name: 'Gradient',
        category: 'Gradients',
        description: 'A gradient shader',
        requiresChild: false,
        propsMetadata: { color1: { type: 'color' }, color2: { type: 'color' } }
      },
      {
        name: 'CursorTrail',
        category: 'Effects',
        description: 'Trail behind cursor',
        requiresChild: false,
        propsMetadata: { size: { type: 'number' }, opacity: { type: 'number' } }
      },
      {
        name: 'WebcamTexture',
        category: 'Camera',
        description: 'Shows webcam feed',
        requiresChild: false,
        propsMetadata: { deviceId: { type: 'string' } }
      },
      {
        name: 'Fog',
        category: 'Atmosphere',
        description: 'Fog effect',
        requiresChild: false,
        propsMetadata: { density: { type: 'number' } }
      }
    ];

    const catalogo = construirCatalogo(registro);

    // Verificar que tiene las categorías esperadas
    expect(Object.keys(catalogo)).toEqual(['Gradients', 'Effects', 'Camera', 'Atmosphere']);

    // Verificar Gradient
    const gradient = catalogo.Gradients[0];
    expect(gradient.name).toBe('Gradient');
    expect(gradient.requiereCamara).toBe(false);
    expect(gradient.interactivo).toBe(false);
    expect(gradient.necesitaHijo).toBe(false);
    expect(gradient.pesado).toBe(false);
    expect(gradient.props).toEqual({ color1: { type: 'color' }, color2: { type: 'color' } });

    // Verificar CursorTrail
    const cursor = catalogo.Effects[0];
    expect(cursor.name).toBe('CursorTrail');
    expect(cursor.requiereCamara).toBe(false);
    expect(cursor.interactivo).toBe(true); // porque incluye 'Cursor'
    expect(cursor.necesitaHijo).toBe(false);
    expect(cursor.pesado).toBe(false);
    expect(cursor.props).toEqual({ size: { type: 'number' }, opacity: { type: 'number' } });

    // Verificar WebcamTexture
    const webcam = catalogo.Camera[0];
    expect(webcam.name).toBe('WebcamTexture');
    expect(webcam.requiereCamara).toBe(true);
    expect(webcam.interactivo).toBe(false);
    expect(webcam.necesitaHijo).toBe(false);
    expect(webcam.pesado).toBe(false);
    expect(webcam.props).toEqual({ deviceId: { type: 'string' } });

    // Verificar Fog
    const fog = catalogo.Atmosphere[0];
    expect(fog.name).toBe('Fog');
    expect(fog.requiereCamara).toBe(false);
    expect(fog.interactivo).toBe(false);
    expect(fog.necesitaHijo).toBe(false);
    expect(fog.pesado).toBe(true); // porque Fog está en la lista de pesado
    expect(fog.props).toEqual({ density: { type: 'number' } });
  });
});