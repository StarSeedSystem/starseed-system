import { describe, it, expect } from 'vitest';
import { detectarAdaptadores } from '../adaptadores';

describe('plantillaStarSeed', () => {
  it('no debe contener GSAP en su HTML', () => {
    const html = '<h1>Test</h1>'
      + '<style>body { color: red; }</style>'
      + '<div data-composition-id="main">Contenido</div>';
    expect(html).not.toContain('gsap');
  });
});

describe('detectarAdaptadores', () => {
  it('debe detectar CSS', () => {
    const html = '<div style="animation: slide 1s;"></div>';
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain('css');
    expect(resultado.editableVisualmente).toBe(true);
  });

  it('debe detectar WAAPI', () => {
    const html = '<div style="transform: translateX(100px); animation: fade 1s;"></div>';
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain('waapi');
    expect(resultado.editableVisualmente).toBe(true);
  });

  it('debe detectar Anime.js', () => {
    const html = '<script src="https://cdn.jsdelivr.net/npm/animejs"></script>';
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain('animejs');
    expect(resultado.editableVisualmente).toBe(true);
  });

  it('debe detectar Lottie', () => {
    const html = '<lottie-player src="animación.json"></lottie-player>';
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain('lottie');
    expect(resultado.editableVisualmente).toBe(true);
  });

  it('debe detectar Three.js', () => {
    const html = '<script src="three.js"></script>';
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain('three');
    expect(resultado.editableVisualmente).toBe(true);
  });

  it('debe detectar TypeGPU', () => {
    const html = '<div>Configuración WebGPU</div>';
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain('typegpu');
    expect(resultado.editableVisualmente).toBe(true);
  });

  it('debe detectar GSAP (no editable visualmente)', () => {
    const html = '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>';
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain('gsap');
    expect(resultado.editableVisualmente).toBe(false);
    expect(resultado.motivo).toContain('Licencia GSAP');
  });
});
