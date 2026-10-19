import { describe, it, expect } from 'vitest';
import { construirCatalogo } from '../catalogo-shaders';

describe('construirCatalogo', () => {
  it('should group shaders by translated category', () => {
    const mockRegistry: Array<{ name: string; category: string; requiresChild?: boolean; propsMetadata?: Record<string, any> }> = [
      { name: 'TestShader1', category: 'Blurs', requiresChild: false, propsMetadata: { intensity: { default: 1 } } },
      { name: 'TestShader2', category: 'Blurs', requiresChild: true, propsMetadata: { speed: { default: 2 } } },
      { name: 'TestShader3', category: 'Shapes', requiresChild: false, propsMetadata: {} },
    ];

    const result = construirCatalogo(mockRegistry as any);

    expect(result).toHaveProperty('Desenfoques');
    expect(result.Desenfoques).toHaveLength(2);
    expect(result).toHaveProperty('Formas');
    expect(result.Formas).toHaveLength(1);
  });

  it('should mark requiereCamara for WebcamTexture and ObjectTracker', () => {
    const mockRegistry: Array<{ name: string; category: string }> = [
      { name: 'WebcamTexture', category: 'Utilities' },
      { name: 'ObjectTracker', category: 'Utilities' },
      { name: 'NormalShader', category: 'Utilities' },
    ];

    const result = construirCatalogo(mockRegistry as any);

    const utilities = result.Utilidades;
    expect(utilities[0].requiereCamara).toBe(true);
    expect(utilities[1].requiereCamara).toBe(true);
    expect(utilities[2].requiereCamara).toBe(false);
  });

  it('should mark interactivo for Cursor* shaders', () => {
    const mockRegistry: Array<{ name: string; category: string }> = [
      { name: 'CursorRipples', category: 'Interactive' },
      { name: 'CursorTrail', category: 'Interactive' },
      { name: 'NormalShader', category: 'Interactive' },
    ];

    const result = construirCatalogo(mockRegistry as any);

    const interactive = result.Interactivo;
    expect(interactive[0].interactivo).toBe(true);
    expect(interactive[1].interactivo).toBe(true);
    expect(interactive[2].interactivo).toBe(false);
  });

  it('should mark necesitaHijo from requiresChild', () => {
    const mockRegistry: Array<{ name: string; category: string; requiresChild?: boolean }> = [
      { name: 'Shader1', category: 'Utilities', requiresChild: true },
      { name: 'Shader2', category: 'Utilities', requiresChild: false },
      { name: 'Shader3', category: 'Utilities' },
    ];

    const result = construirCatalogo(mockRegistry as any);

    const utilities = result.Utilidades;
    expect(utilities[0].necesitaHijo).toBe(true);
    expect(utilities[1].necesitaHijo).toBe(false);
    expect(utilities[2].necesitaHijo).toBe(false);
  });

  it('should mark pesado for heavy shaders', () => {
    const mockRegistry: Array<{ name: string; category: string }> = [
      { name: 'Fog', category: 'Utilities' },
      { name: 'Smoke', category: 'Utilities' },
      { name: 'ReactionDiffusion', category: 'Utilities' },
      { name: 'Boids', category: 'Utilities' },
      { name: 'Particles', category: 'Utilities' },
      { name: 'Water', category: 'Utilities' },
      { name: 'Godrays', category: 'Utilities' },
      { name: 'Light', category: 'Utilities' },
    ];

    const result = construirCatalogo(mockRegistry as any);

    const utilities = result.Utilidades;
    // Check that the first seven are marked as pesado
    for (let i = 0; i < 7; i++) {
      expect(utilities[i].pesado).toBe(true);
    }
    expect(utilities[7].pesado).toBe(false);
  });

  it('should extract props from propsMetadata', () => {
    const mockRegistry: Array<{ name: string; category: string; propsMetadata?: Record<string, any> }> = [
      { name: 'Shader1', category: 'Utilities', propsMetadata: { propA: {}, propB: {} } },
      { name: 'Shader2', category: 'Utilities', propsMetadata: {} },
      { name: 'Shader3', category: 'Utilities' },
    ];

    const result = construirCatalogo(mockRegistry as any);

    const utilities = result.Utilidades;
    expect(utilities[0].props).toEqual(['propA', 'propB']);
    expect(utilities[1].props).toEqual([]);
    expect(utilities[2].props).toEqual([]);
  });

  it('should return empty object for empty registry', () => {
    const mockRegistry: Array<{ name: string; category: string }> = [];

    const result = construirCatalogo(mockRegistry as any);

    expect(result).toEqual({});
  });
});