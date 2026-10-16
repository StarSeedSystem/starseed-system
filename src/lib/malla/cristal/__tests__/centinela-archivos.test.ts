import { describe, it, expect } from 'vitest';
import { decidirEntrada, type AnalisisEntrada, type ResonanciaEntrada } from '../centinela-archivos';

describe('decidirEntrada', () => {
  it('rechaza por peligroso', () => {
    const r = decidirEntrada({ nivel: 'peligroso', motivos: ['Ejecutable detectado'] }, null);
    expect(r.accion).toBe('rechazar');
    expect(r.texto).toContain('Ejecutable detectado');
  });

  it('rechaza por cuarentena aunque nivel sea limpio', () => {
    const r = decidirEntrada({ nivel: 'limpio', motivos: [] }, { decision: 'cuarentena' });
    expect(r.accion).toBe('rechazar');
    expect(r.texto).toMatch(/CUARENTENA/);
  });

  it('avisa por sospechoso con motivos', () => {
    const r = decidirEntrada({ nivel: 'sospechoso', motivos: ['Shebang'] }, null);
    expect(r.accion).toBe('avisar');
    expect(r.texto).toContain('Shebang');
  });

  it('avisa por aviso de resonancia aunque nivel sea limpio', () => {
    const r = decidirEntrada({ nivel: 'limpio', motivos: ['Nota'] }, { decision: 'aviso' });
    expect(r.accion).toBe('avisar');
    expect(r.texto).toContain('Nota');
  });

  it('acepta con pregunta cuando todo está limpio', () => {
    const r = decidirEntrada({ nivel: 'limpio', motivos: [] }, { decision: 'limpio' });
    expect(r.accion).toBe('aceptar-con-pregunta');
    expect(r.texto).toContain('¿Aceptar');
  });

  it('acepta con pregunta sin datos de resonancia', () => {
    const r = decidirEntrada({ nivel: 'limpio', motivos: [] }, null);
    expect(r.accion).toBe('aceptar-con-pregunta');
  });

  it('rechaza peligroso con motivos múltiples', () => {
    const r = decidirEntrada({ nivel: 'peligroso', motivos: ['A', 'B'] }, { decision: 'limpio' });
    expect(r.accion).toBe('rechazar');
    expect(r.texto).toContain('A');
    expect(r.texto).toContain('B');
  });
});
