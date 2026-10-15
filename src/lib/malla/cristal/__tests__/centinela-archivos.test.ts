import { describe, it, expect } from 'vitest';
import { decidirEntrada } from '../centinela-archivos';

// Pruebas de `decidirEntrada`: la puerta del centinela antes de aceptar un
// archivo por la malla — análisis local + resonancia de la red (§4.5 y §5.6).

describe('decidirEntrada', () => {
  it('rechaza un análisis peligroso aunque no haya resonancia', () => {
    const d = decidirEntrada(
      { nivel: 'peligroso', motivos: ['Ejecutable DOS (MZ) detectado por bytes mágicos'] },
      null,
    );
    expect(d.accion).toBe('rechazar');
    expect(d.texto).toContain('Ejecutable DOS (MZ) detectado por bytes mágicos');
  });

  it('rechaza por cuarentena de la red aunque el análisis local sea limpio', () => {
    const d = decidirEntrada(
      { nivel: 'limpio', motivos: [] },
      { decision: 'cuarentena' },
    );
    expect(d.accion).toBe('rechazar');
    expect(d.texto).toContain('cuarentena');
  });

  // (más casos abajo)

  it('la cuarentena manda sobre el aviso: sospechoso + cuarentena se rechaza con ambos motivos', () => {
    const d = decidirEntrada(
      { nivel: 'sospechoso', motivos: ['Shebang (#!) detectado al inicio del archivo'] },
      { decision: 'cuarentena' },
    );
    expect(d.accion).toBe('rechazar');
    expect(d.texto).toContain('Shebang (#!) detectado al inicio del archivo');
    expect(d.texto).toContain('cuarentena');
  });

  it('avisa con los motivos cuando el análisis es sospechoso', () => {
    const d = decidirEntrada(
      { nivel: 'sospechoso', motivos: ['Tipo real (PNG) no coincide con la extensión (.txt)'] },
      null,
    );
    expect(d.accion).toBe('avisar');
    expect(d.texto).toContain('Tipo real (PNG) no coincide con la extensión (.txt)');
  });

  it('avisa cuando la red marca un aviso aunque el análisis local sea limpio', () => {
    const d = decidirEntrada(
      { nivel: 'limpio', motivos: [] },
      { decision: 'aviso' },
    );
    expect(d.accion).toBe('avisar');
    expect(d.texto).toContain('aviso');
  });

  it('sospechoso local + aviso de la red junta los dos motivos en el texto', () => {
    const d = decidirEntrada(
      { nivel: 'sospechoso', motivos: ['Shebang (#!) detectado al inicio del archivo'] },
      { decision: 'aviso' },
    );
    expect(d.accion).toBe('avisar');
    expect(d.texto).toContain('Shebang (#!) detectado al inicio del archivo');
    expect(d.texto).toContain('resonancia de la red');
  });

  it('aceptar-con-pregunta: limpio sin resonancia, con sin-datos y con limpio', () => {
    expect(decidirEntrada({ nivel: 'limpio', motivos: [] }, null).accion).toBe('aceptar-con-pregunta');
    expect(decidirEntrada({ nivel: 'limpio', motivos: [] }, { decision: 'sin-datos' }).accion).toBe('aceptar-con-pregunta');
    const d = decidirEntrada({ nivel: 'limpio', motivos: [] }, { decision: 'limpio' });
    expect(d.accion).toBe('aceptar-con-pregunta');
    expect(d.texto.length).toBeGreaterThan(0);
  });

  it('nunca deja un texto vacío: sospechoso sin motivos cae en el repuesto', () => {
    const d = decidirEntrada({ nivel: 'sospechoso', motivos: [] }, null);
    expect(d.accion).toBe('avisar');
    expect(d.texto).toContain('sin motivos detallados');
  });
});
