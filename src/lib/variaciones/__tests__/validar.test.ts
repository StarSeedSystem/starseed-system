// Pruebas para el validador de variaciones públicas y detector de aislamiento de código
import { describe, it, expect } from 'vitest';
import { validarVariacion, type Variacion } from '../validar';

describe('validarVariacion', () => {
  const variacionBase: Variacion = {
    clave: 'widget:clima',
    tipo: 'variacion',
    nota: 'Test',
    payload: { temperatura: 25, humedad: 0.6 },
    familia: 'widget',
    version: '1.0.0',
    licencia: 'MIT',
    requiereAislamiento: false,
  };

  it('debe aprobar una variación simple válida', () => {
    const variacion: Variacion = { ...variacionBase };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(true);
  });

  it('debe rechazar una variación que exceda el tamaño máximo', () => {
    const payloadGrande = {};
    // Create payload that exceeds 256KB (256 * 1024 = 262,144 bytes)
    const targetSize = 300000; // Bytes to exceed
    const itemsNeeded = Math.ceil(targetSize / 50); // 50 bytes per item (key + value)
    for (let i = 0; i < itemsNeeded; i++) {
      payloadGrande[`prop${i}`] = 'x'.repeat(50);
    }
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadGrande,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('excede el límite');
  });

  it('debe rechazar un payload que no sea JSON plano', () => {
    const payloadConFuncion = { fn: () => { } };
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadConFuncion,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('no es JSON plano');
  });

  it('debe rechazar un payload que contenga claves privadas', () => {
    const payloadConClavePrivada = { SYNCED_KEYS: 'secret_value', normal: 'ok' };
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadConClavePrivada,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('contiene claves privadas');
  });

  it('debe rechazar un payload que contenga valores privados', () => {
    const payloadConToken = { normal: 'ok', token: 'sk_test_123' };
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadConToken,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('contiene valores privados');
  });

  it('debe rechazar un payload que contenga URLs que no sean HTTPS', () => {
    const payloadConHttp = { normal: 'ok', url: 'http://ejemplo.com' };
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadConHttp,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('contiene URLs que no son HTTPS');
  });

  it('debe rechazar una variación de código que no tenga requiereAislamiento', () => {
    const variacion: Variacion = {
      ...variacionBase,
      familia: 'codigo',
      payload: { codigo: 'console.log("hello")' },
      requiereAislamiento: false,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('deben tener requiereAislamiento: true');
  });

  it('debe rechazar una variación aislada con allow-same-origin en enlaceExterno', () => {
    const variacion: Variacion = {
      ...variacionBase,
      familia: 'codigo',
      payload: { codigo: 'console.log("hello")' },
      requiereAislamiento: true,
      enlaceExterno: 'https://example.com/embed?allow-same-origin',
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('no deben abrirse con allow-same-origin');
  });

  it('debe aprobar una variación de código con requiereAislamiento', () => {
    const variacion: Variacion = {
      ...variacionBase,
      familia: 'codigo',
      payload: { codigo: 'console.log("hello")' },
      requiereAislamiento: true,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(true);
  });

  it('debe detectar valores privados de tipo token (UUID-like)', () => {
    const payloadConUuid = { normal: 'ok', id: '550e8400-e29b-41d4-a716-446655440000' };
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadConUuid,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('contiene valores privados');
  });

  it('debe detectar valores privados de tipo token JWT', () => {
    const payloadConJwt = { normal: 'ok', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' };
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadConJwt,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos).toContain('contiene valores privados');
  });

  it('debe detectar varias razones de invalidación', () => {
    const payloadInvalido = {
      fn: () => { },
      private: 'value',
      url: 'ftp://example.com',
    };
    const variacion: Variacion = {
      ...variacionBase,
      payload: payloadInvalido,
    };
    const resultado = validarVariacion(variacion);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos.length).toBeGreaterThan(1);
    expect(resultado.motivos.some((m) => m.includes('no es JSON plano'))).toBe(true);
    expect(resultado.motivos.some((m) => m.includes('claves privadas'))).toBe(true);
    expect(resultado.motivos.some((m) => m.includes('URLs que no son HTTPS'))).toBe(true);
  });

  it('debe detectar familias conocidas de código', () => {
    const familiasCodigo = ['codigo', 'javascript', 'typescript', 'html', 'css', 'react', 'vue', 'angular'];
    const familiasNoCodigo = ['widget', 'fondo', 'ajuste', 'tema'];

    familiasCodigo.forEach((familia) => {
      const variacion: Variacion = {
        ...variacionBase,
        familia,
        payload: { codigo: 'test' },
        requiereAislamiento: true,
      };
      const resultado = validarVariacion(variacion);
      expect(resultado.ok).toBe(true);
    });

    familiasNoCodigo.forEach((familia) => {
      const variacion: Variacion = {
        ...variacionBase,
        familia,
        payload: { normal: 'value' },
        requiereAislamiento: false,
      };
      const resultado = validarVariacion(variacion);
      expect(resultado.ok).toBe(true);
    });
  });
});
