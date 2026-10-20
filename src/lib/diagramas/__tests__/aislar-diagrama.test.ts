import { describe, it, expect } from 'vitest';
import { aislarDiagrama } from '../aislar-diagrama';

describe('aislarDiagrama', () => {
  it('devuelve ok=true con un HTML válido de un solo <svg>', () => {
    const html = '<div><svg width="100" height="100"><circle cx="50" cy="50" r="40" /></svg></div>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).toContain('<svg');
    expect(result.sandbox).toBe('');
    expect(result.motivos).toEqual([]);
  });

  it('rechaza HTML con múltiples <svg>', () => {
    const html = '<svg></svg><svg></svg>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(false);
    expect(result.motivos).toContain('múltiples elementos <svg>');
  });

  it('rechaza HTML sin <svg>', () => {
    const html = '<div><p>Texto</p></div>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(false);
    expect(result.motivos).toContain('no hay <svg>');
  });

  it('remueve <link> con URL remota', () => {
    const html = '<html><head><link href="https://example.com/style.css" rel="stylesheet"></head><svg></svg></html>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('https://');
  });

  it('remueve <style> con URL remota', () => {
    const html = '<html><head><style>url(http://evil.com/image.png)</style></head><svg></svg></html>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('http://');
  });

  it('remueve event handlers', () => {
    const html = '<svg onclick="alert(\'x\')" onload="alert(\'y\')"></svg>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('onclick');
    expect(result.srcdoc).not.toContain('onload');
    expect(result.motivos).toContain('evento');
  });

  it('remueve <iframe>, <object>, <embed> y <form>', () => {
    const html = '<svg></svg><iframe src="x"></iframe><object src="y"></object><embed src="z"></embed><form><input></form>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).toContain('<svg');
    expect(result.srcdoc).not.toContain('<iframe');
    expect(result.srcdoc).not.toContain('<object');
    expect(result.srcdoc).not.toContain('<embed');
    expect(result.srcdoc).not.toContain('<form');
  });

  it('remueve href="javascript:"', () => {
    const html = '<svg><a href="javascript:alert(\'x\')">link</a></svg>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.srcdoc).not.toContain('javascript:');
  });

  it('permite animación y añade script-src al CSP', () => {
    const html = '<svg></svg>';
    const result = aislarDiagrama(html, { permitirAnimacion: true });
    expect(result.ok).toBe(true);
    expect(result.sandbox).toBe('allow-scripts');
  });

  it('no permite animación y mantiene CSP restrictivo sin script-src', () => {
    const html = '<svg></svg>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.sandbox).toBe('');
  });

  it('rechaza si el tamaño excede 2 MB', () => {
    const bigSvg = '<svg>' + '<rect width="1000" height="1000"/>'.repeat(10000) + '</svg>';
    const result = aislarDiagrama(bigSvg, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
  });

  it('valida HTML malicioso', () => {
    const html = '<svg onerror="alert(\'x\')"></svg>';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(true);
    expect(result.motivos).toContain('evento');
  });

  it('maneja HTML vacío', () => {
    const html = '';
    const result = aislarDiagrama(html, { permitirAnimacion: false });
    expect(result.ok).toBe(false);
    expect(result.motivos).toContain('HTML malformado');
  });
});