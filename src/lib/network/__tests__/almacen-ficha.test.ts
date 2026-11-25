import { describe, it, expect } from 'vitest';
import { almacenEnFicha, fichaAlmacenCompacta, ambitosPermitidos } from '../almacen-ficha';

describe('almacenEnFicha', () => {
  it('añade libreMb, prestaMb y ámbitos a la ficha', () => {
    const ficha = {
      nodoId: 'nodo1',
      capacidad: { nucleos: 4, ramLibreMb: 2048 }
    };
    const resultado = almacenEnFicha({
      ficha,
      libreMb: 10240,
      prestaMb: 5120,
      ambitos: ['privado', 'publico']
    });
    expect(resultado.almacen?.libreMb).toBe(10240);
    expect(resultado.almacen?.prestaMb).toBe(5120);
    expect(resultado.almacen?.ambitos).toEqual(['privado', 'publico']);
  });

  it('no supera 200 bytes en la serialización', () => {
    const ficha = {
      nodoId: 'nodo1',
      capacidad: { nucleos: 4, ramLibreMb: 2048 },
      almacen: {
        libreMb: 10240,
        prestaMb: 5120,
        ambitos: ['privado', 'grupo', 'comunidad', 'publico'] as const
      }
    };
    const json = JSON.stringify(ficha).length;
    expect(json).toBeLessThanOrEqual(200);
  });

  it('no incluye rutas, discos ni ids de dueño', () => {
    const ficha = {
      nodoId: 'nodo1',
      capacidad: { nucleos: 4, ramLibreMb: 2048 }
    };
    const resultado = almacenEnFicha({
      ficha,
      libreMb: 10240,
      prestaMb: 5120,
      ambitos: ['privado']
    });
    expect(resultado.almacen).not.toHaveProperty('ruta');
    expect(resultado.almacen).not.toHaveProperty('disqo');
    expect(resultado.almacen).not.toHaveProperty('dueñoId');
  });
});

describe('fichaAlmacenCompacta', () => {
  it('compacta la información de almacenén una ficha pequeña', () => {
    const ficha = almacenEnFicha({
      ficha: { nodoId: 'nodo1', capacidad: { nucleos: 4, ramLibreMb: 2048 } },
      libreMb: 10240,
      prestaMb: 5120,
      ambitos: ['privado', 'publico']
    });
    const compacta = fichaAlmacenCompacta(ficha);
    expect(compacta.almacen?.libreMb).toBe(10240);
    expect(compacta.almacen?.prestaMb).toBe(5120);
    expect(compacta.almacen?.ambitos).toEqual(['privado', 'publico']);
  });
});

describe('ambitosPermitidos', () => {
  it('devuelve los ámbitos cuando hay consentimiento', () => {
    const politica = {
      sembrarPublico: true,
      presta: {
        cuenta: true,
        publico: true
      }
    };
    const resultado = ambitosPermitidos({
      politica,
      ambitoPedido: 'publico',
      tieneConsentimiento: true
    });
    expect(resultado).toContain('publico');
  });

  it('excluye público cuando sembrarPublico está apagado', () => {
    const politica = {
      sembrarPublico: false,
      presta: {
        cuenta: true,
        publico: false
      }
    };
    const resultado = ambitosPermitidos({
      politica,
      ambitoPedido: 'publico',
      tieneConsentimiento: true
    });
    expect(resultado).not.toContain('publico');
  });

  it('excluye público cuando no hay consentimiento explícito', () => {
    const politica = {
      sembrarPublico: true,
      presta: {
        cuenta: true,
        publico: true
      }
    };
    const resultado = ambitosPermitidos({
      politica,
      ambitoPedido: 'publico',
      tieneConsentimiento: false
    });
    expect(resultado).not.toContain('publico');
  });

  it('recorta la oferta pública cuando presta.publico está apagado', () => {
    const politica = {
      sembrarPublico: true,
      presta: {
        cuenta: true,
        publico: false
      }
    };
    const resultado = ambitosPermitidos({
      politica,
      ambitoPedido: 'publico',
      tieneConsentimiento: true,
      cuotaPublicaMB: 1024
    });
    expect(resultado).not.toContain('publico');
  });
});