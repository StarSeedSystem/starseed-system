import { prepararDiagrama } from '../aislar-diagrama';
import { describe, it, expect } from 'vitest';

describe('prepararDiagrama', () => {
  it('devuelve ok false cuando el HTML supera 2 MB', () => {
    const html = 'a'.repeat(2 * 1024 * 1024 + 1);
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(false);
    expect(result.motivos).toContain('El HTML supera el límite de 2 MB');
  });

  it('elimina tags <link>', () => {
    const html = '<link rel="stylesheet" href="style.css"><svg></svg>';
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('<link');
    expect(result.srcdoc).toContain('<svg></svg>');
  });

  it('elimina tags <iframe> y su contenido', () => {
    const html = '<iframe src="evil.com">script</iframe><svg></svg>';
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('<iframe');
    expect(result.srcdoc).not.toContain('script');
    expect(result.srcdoc).toContain('<svg></svg>');
  });

  it('elimina @import', () => {
    const html = '<style>@import url("evil.css");</style><svg></svg>';
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('@import');
    expect(result.srcdoc).toContain('<svg></svg>');
  });

  it('elimina url(http...) y url(https...)', () => {
    const html = '<style>body { background: url("http://evil.com/img.png"); }</style><svg></svg>';
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('http://evil.com');
    expect(result.srcdoc).toContain('<svg></svg>');
  });

  it('elimina on* attributes', () => {
    const html = '<div onclick="alert(1)"><svg></svg></div>';
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('onclick');
    expect(result.srcdoc).toContain('<svg></svg>');
  });

  it('elimina javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)"><svg></svg></a>';
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('javascript:');
    expect(result.srcdoc).toContain('<svg></svg>');
  });

  it('requiere exactamente un <svg>', () => {
    // Sin svg
    let result = prepararDiagrama('<div></div>', { permitirAnimacion: false });
    expect(result.ok).toBe(false);
    expect(result.motivos).toContain('El HTML debe contener exactamente un elemento <svg>');

    // Dos svgs
    result = prepararDiagrama('<svg></svg><svg></svg>', { permitirAnimacion: false });
    expect(result.ok).toBe(false);
    expect(result.motivos).toContain('El HTML debe contener exactamente un elemento <svg>');
  });

  it('inserta meta CSP correctamente', () => {
    const html = '<html><head></head><body><svg></svg></body></html>';
    const result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(result.srcdoc).toContain("default-src 'none'");
    expect(result.srcdoc).toContain("style-src 'unsafe-inline'");
    expect(result.srcdoc).toContain("img-src data:");
    expect(result.srcdoc).toContain("font-src data:");
    expect(result.srcdoc).not.toContain("script-src"); // porque permitirAnimacion es false

    const resultWithAnim = prepararDiagrama(html, { permitirAnimacion: true });
    expect(resultWithAnim.ok).toBe(true);
    expect(resultWithAnim.srcdoc).toContain("script-src 'unsafe-inline'");
  });

  it('maneja la ausencia de <head> y <html>', () => {
    let html = '<body><svg></svg></body>';
    let result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).toContain('<html><head><meta http-equiv="Content-Security-Policy"');
    expect(result.srcdoc).toContain('</head><body><svg></svg></body></html>');

    html = '<svg></svg>';
    result = prepararDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).toContain('<html><head><meta http-equiv="Content-Security-Policy"');
    expect(result.srcdoc).toContain('</head><body><svg></svg></body></html>');
  });

  it('establece sandbox correctamente', () => {
    const html = '<svg></svg>';
    const resultNoAnim = prepararDiagrama(html, { permitirAnimacion: false });
    expect(resultNoAnim.ok).toBe(true);
    expect(resultNoAnim.sandbox).toBe('');

    const resultAnim = prepararDiagrama(html, { permitirAnimacion: true });
    expect(resultAnim.ok).toBe(true);
    expect(resultAnim.sandbox).toBe('allow-scripts');
  });
});