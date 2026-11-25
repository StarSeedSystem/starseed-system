import { describe, it, expect } from 'vitest';
import { cuotaEfectiva, puedeAceptar, motivoRechazo } from '../almacen-cuota';

const GB = 1024 * 1024 * 1024;

describe('cuotaEfectiva', () => {
  it('calcula la cuota efectiva como min(libre - reserva, cuota)', () => {
    const resultado = cuotaEfectiva({
      cuotaMb: 10240,
      libreMb: 400,
      reservaMb: 512,
      ambito: 'privado'
    });
    expect(resultado).toBe(0);
  });

  it('respetar la cuota cuando hay suficiente espacio', () => {
    const resultado = cuotaEfectiva({
      cuotaMb: 10240,
      libreMb: 20480,
      reservaMb: 512,
      ambito: 'privado'
    });
    expect(resultado).toBe(10240);
  });
});

describe('puedeAceptar', () => {
  it('rechaza cuando no hay cuota configurada', () => {
    const resultado = puedeAceptar({
      cuotaMb: 0,
      libreMb: 10240,
      usadoMb: 0,
      reservaMb: 512,
      ambito: 'privado'
    });
    expect(resultado).toBe(false);
  });

  it('acepta cuando hay espacio suficiente bajo cuota', () => {
    const resultado = puedeAceptar({
      cuotaMb: 10240,
      libreMb: 20480,
      usadoMb: 2048,
      reservaMb: 512,
      ambito: 'privado'
    });
    expect(resultado).toBe(true);
  });

  it('rechaza cuando la cuota está superada', () => {
    const resultado = puedeAceptar({
      cuotaMb: 100,
      libreMb: 10240,
      usadoMb: 150,
      reservaMb: 512,
      ambito: 'privado'
    });
    expect(resultado).toBe(false);
  });

  it('reserva que impide ofrecer el último GB', () => {
    const resultado = puedeAceptar({
      cuotaMb: 100,
      libreMb: 100,
      usadoMb: 0,
      reservaMb: 100,
      ambito: 'privado'
    });
    expect(resultado).toBe(false);
  });
});

describe('motivoRechazo', () => {
  it('cambia a "sin-cuota" cuando no hay cuota', () => {
    const m = motivoRechazo({
      cuotaMb: 0,
      libreMb: 10240,
      usadoMb: 0,
      reservaMb: 512,
      ambito: 'privado'
    });
    expect(m).toBe('sin-cuota');
  });

  it('cambia a "cuota-superada" cuando se excede', () => {
    const m = motivoRechazo({
      cuotaMb: 100,
      libreMb: 20480,
      usadoMb: 150,
      reservaMb: 512,
      ambito: 'privado'
    });
    expect(m).toBe('cuota-superada');
  });

  it('cambia a "reserva-imposible" cuando la reserva consume todo', () => {
    const m = motivoRechazo({
      cuotaMb: 100,
      libreMb: 100,
      usadoMb: 0,
      reservaMb: 100,
      ambito: 'privado'
    });
    expect(m).toBe('reserva-imposible');
  });

  it('cambia a "ambito-agotado" cuando el ámbito no tiene consentimiento', () => {
    const m = motivoRechazo({
      cuotaMb: 10240,
      libreMb: 20480,
      usadoMb: 0,
      reservaMb: 512,
      ambito: 'publico',
      consentimiento: false
    });
    expect(m).toBe('ambito-agotado');
  });

  it('retorna null cuando todo está bien', () => {
    const m = motivoRechazo({
      cuotaMb: 10240,
      libreMb: 20480,
      usadoMb: 2000,
      reservaMb: 512,
      ambito: 'privado',
      consentimiento: true
    });
    expect(m).toBe(null);
  });
});