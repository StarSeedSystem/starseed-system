import { describe, it, expect } from 'vitest';
import { huellaDeCopia, copiaVerificada, planAlivio } from '../almacen-verificacion';

describe('huellaDeCopia', () => {
  it('crea una huella con número de entradas, bytes y SHA-256', () => {
    const huella = huellaDeCopia({
      entradas: 100,
      bytes: 1024,
      sha256Listas: ['a'.repeat(64), 'b'.repeat(64)]
    });
    expect(huella).toEqual({
      entradas: 100,
      bytes: 1024,
      sha256: ['a'.repeat(64), 'b'.repeat(64)]
    });
  });
});

describe('copiaVerificada', () => {
  it('devuelve true cuando la copia está completa', async () => {
    const resultado = await copiaVerificada({
      huellaOriginal: {
        entradas: 100,
        bytes: 1024,
        sha256: ['a'.repeat(64)]
      },
      huellaCopiada: {
        entradas: 100,
        bytes: 1024,
        sha256: ['a'.repeat(64)]
      }
    });
    expect(resultado).toBe(true);
  });

  it('devuelve false cuando el número de entradas no coincide', async () => {
    const resultado = await copiaVerificada({
      huellaOriginal: {
        entradas: 100,
        bytes: 1024,
        sha256: ['a'.repeat(64)]
      },
      huellaCopiada: {
        entradas: 50,
        bytes: 1024,
        sha256: ['a'.repeat(64)]
      }
    });
    expect(resultado).toBe(false);
  });

  it('devuelve false cuando los bytes no coinciden', async () => {
    const resultado = await copiaVerificada({
      huellaOriginal: {
        entradas: 100,
        bytes: 1024,
        sha256: ['a'.repeat(64)]
      },
      huellaCopiada: {
        entradas: 100,
        bytes: 512,
        sha256: ['a'.repeat(64)]
      }
    });
    expect(resultado).toBe(false);
  });

  it('devuelve false cuando un SHA-256 no coincide', async () => {
    const resultado = await copiaVerificada({
      huellaOriginal: {
        entradas: 100,
        bytes: 1024,
        sha256: ['a'.repeat(64), 'b'.repeat(64)]
      },
      huellaCopiada: {
        entradas: 100,
        bytes: 1024,
        sha256: ['a'.repeat(64), 'c'.repeat(64)]
      }
    });
    expect(resultado).toBe(false);
  });
});

describe('planAlivio', () => {
  it('acepta rutas de la lista blanca', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/.next/cache'],
      tieneColaActiva: false
    });
    expect(resultado).toEqual({ aceptado: ['/proyecto/.next/cache'], rechazado: [] });
  });

  it('rechaza secretos', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/.env.local', '/proyecto/.next/cache'],
      tieneColaActiva: false
    });
    expect(resultado.aceptado).toEqual(['/proyecto/.next/cache']);
    expect(resultado.rechazado).toContain('/proyecto/.env.local');
  });

  it('rechaza .git', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/.git', '/proyecto/logs/app.log'],
      tieneColaActiva: false
    });
    expect(resultado.aceptado).toEqual(['/proyecto/logs/app.log']);
    expect(resultado.rechazado).toContain('/proyecto/.git');
  });

  it('rechaza starseed_memory_root', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/starseed_memory_root', '/proyecto/node_modules/.cache'],
      tieneColaActiva: false
    });
    expect(resultado.aceptado).toEqual(['/proyecto/node_modules/.cache']);
    expect(resultado.rechazado).toContain('/proyecto/starseed_memory_root');
  });

  it('rechaza worktrees con cola activa', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/.next/cache', '/proyecto/starseed-wt-test'],
      tieneColaActiva: true
    });
    expect(resultado.aceptado).toEqual(['/proyecto/.next/cache']);
    expect(resultado.rechazado).toContain('/proyecto/starseed-wt-test');
  });

  it('acepta worktrees sin cola activa', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/starseed-wt-test'],
      tieneColaActiva: false
    });
    expect(resultado.aceptado).toEqual(['/proyecto/starseed-wt-test']);
  });

  it('rechaza archivos de entorno', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/.env', '/proyecto/.env.backup', '/proyecto/.next/cache'],
      tieneColaActiva: false
    });
    expect(resultado.aceptado).toEqual(['/proyecto/.next/cache']);
    expect(resultado.rechazado).toContain('/proyecto/.env');
    expect(resultado.rechazado).toContain('/proyecto/.env.backup');
  });

  it('rechaza claves y certificados', () => {
    const resultado = planAlivio({
      rutas: ['/proyecto/key.pem', '/proyecto/cert.crt', '/proyecto/logs/app.log'],
      tieneColaActiva: false
    });
    expect(resultado.aceptado).toEqual(['/proyecto/logs/app.log']);
    expect(resultado.rechazado).toContain('/proyecto/key.pem');
    expect(resultado.rechazado).toContain('/proyecto/cert.crt');
  });
});