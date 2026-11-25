import { describe, it, expect } from 'vitest';
import { planPruebaEspacio, evaluarPruebaEspacio, ofertaTrasMedicion } from '../almacen-prueba';

describe('planPruebaEspacio', () => {
  it('planifica la prueba de espacio para un medio listo', () => {
    const plan = planPruebaEspacio({
      estado: 'listo',
      espacioDeclaradoMB: 10240,
      cuotaMB: 5120
    });
    expect(plan).toBe(true);
  });

  it('devuelve false para medio ausente', () => {
    const plan = planPruebaEspacio({
      estado: 'ausente',
      espacioDeclaradoMB: 10240,
      cuotaMB: 5120
    });
    expect(plan).toBe(false);
  });

  it('devuelve false para medio sin imagen', () => {
    const plan = planPruebaEspacio({
      estado: 'sin-imagen',
      espacioDeclaradoMB: 10240,
      cuotaMB: 5120
    });
    expect(plan).toBe(false);
  });

  it('devuelve false para otro-disco', () => {
    const plan = planPruebaEspacio({
      estado: 'otro-disco',
      espacioDeclaradoMB: 10240,
      cuotaMB: 5120
    });
    expect(plan).toBe(false);
  });
});

describe('evaluarPruebaEspacio', () => {
  it('devuelve oferta cuando el espacio coincide', () => {
    const resultado = evaluarPruebaEspacio({
      espacioDeclaradoMB: 10240,
      espacioMedidoMB: 10240,
      cuotaMB: 5120,
      reservaMB: 512
    });
    expect(resultado).toEqual({
      ofertaMB: 5120,
      motivo: null
    });
  });

  it('devuelve oferta recortada cuando el espacio es menor', () => {
    const resultado = evaluarPruebaEspacio({
      espacioDeclaradoMB: 10240,
      espacioMedidoMB: 3000,
      cuotaMB: 5120,
      reservaMB: 512
    });
    expect(resultado.ofertaMB).toBe(2488);
    expect(resultado.motivo).toBe('espacio-menor-esperado');
  });

  it('devuelve pendiente cuando el espacio es insuficiente', () => {
    const resultado = evaluarPruebaEspacio({
      espacioDeclaradoMB: 10240,
      espacioMedidoMB: 100,
      cuotaMB: 5120,
      reservaMB: 512
    });
    expect(resultado).toEqual({
      ofertaMB: 0,
      motivo: 'pendiente'
    });
  });
});

describe('ofertaTrasMedicion', () => {
  it('reduce la oferta tras medir el último GB reservado', () => {
    const resultado = ofertaTrasMedicion({
      ofertaDeclaradaMB: 10240,
      espacioMedidoMB: 10239,
      cuotaMB: 5120,
      reservaMB: 1
    });
    expect(resultado).toBeLessThan(10240);
  });

  it('mantiene la oferta cuando el espacio es suficiente', () => {
    const resultado = ofertaTrasMedicion({
      ofertaDeclaradaMB: 5120,
      espacioMedidoMB: 8000,
      cuotaMB: 5120,
      reservaMB: 512
    });
    expect(resultado).toBe(5120);
  });
});