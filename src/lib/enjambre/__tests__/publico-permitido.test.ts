import { describe, it, expect } from 'vitest';
import { esPublicable, motivoNoPublicable } from '../publico-permitido';

describe('esPublicable', () => {
  it('devuelve true para una pieza con raíz, semilla firmada e imán', () => {
    const resultado = esPublicable({
      ambito: 'publico',
      tieneConsentimiento: true,
      raiz: 'a'.repeat(64),
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(resultado).toBe(true);
  });

  it('devuelve false cuando el ámbito no es público', () => {
    const resultado = esPublicable({
      ambito: 'privado',
      tieneConsentimiento: true,
      raiz: 'a'.repeat(64),
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(resultado).toBe(false);
  });

  it('devuelve false cuando no hay consentimiento', () => {
    const resultado = esPublicable({
      ambito: 'publico',
      tieneConsentimiento: false,
      raiz: 'a'.repeat(64),
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(resultado).toBe(false);
  });

  it('devuelve false cuando falta la raíz', () => {
    const resultado = esPublicable({
      ambito: 'publico',
      tieneConsentimiento: true,
      raiz: '',
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(resultado).toBe(false);
  });

  it('devuelve false cuando la firma no es válida', () => {
    const resultado = esPublicable({
      ambito: 'publico',
      tieneConsentimiento: true,
      raiz: 'a'.repeat(64),
      firmaValida: false,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(resultado).toBe(false);
  });
});

describe('motivoNoPublicable', () => {
  it('indica "ámbito-no-publico" cuando el ámbito no es público', () => {
    const m = motivoNoPublicable({
      ambito: 'privado',
      tieneConsentimiento: true,
      raiz: 'a'.repeat(64),
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(m).toBe('ámbito-no-publico');
  });

  it('indica "sin-consentimiento" cuando falta consentimiento', () => {
    const m = motivoNoPublicable({
      ambito: 'publico',
      tieneConsentimiento: false,
      raiz: 'a'.repeat(64),
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(m).toBe('sin-consentimiento');
  });

  it('indica "sin-raíz" cuando falta la raíz', () => {
    const m = motivoNoPublicable({
      ambito: 'publico',
      tieneConsentimiento: true,
      raiz: '',
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(m).toBe('sin-raíz');
  });

  it('indica "firma-no-válida" cuando la firma no es válida', () => {
    const m = motivoNoPublicable({
      ambito: 'publico',
      tieneConsentimiento: true,
      raiz: 'a'.repeat(64),
      firmaValida: false,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'documento.md' }
    });
    expect(m).toBe('firma-no-válida');
  });

  it('indica "especificación prohibida" para secretos', () => {
    const m = motivoNoPublicable({
      ambito: 'publico',
      tieneConsentimiento: true,
      raiz: 'a'.repeat(64),
      firmaValida: true,
      contenido: { tipo: 'archivo', nombre: '.env.local', tamano: 1024 }
    });
    expect(m).toBe('especificación prohibida');
  });

  it('devuelve null cuando todo está bien', () => {
    const m = motivoNoPublicable({
      ambito: 'publico',
      tieneConsentimiento: true,
      raiz: 'a'.repeat(64),
      firmaValida: true,
      contenido: { tipo: 'pieza', tamano: 1024, nombre: 'imagen.png' }
    });
    expect(m).toBe(null);
  });
});