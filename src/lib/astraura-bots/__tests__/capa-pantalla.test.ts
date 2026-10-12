import { describe, it, expect, vi } from 'vitest';
import {
  normalizarCapa,
  crearCapa,
  apilar,
  retirarPorId,
  type Capa,
  type CapaNormalizada,
} from '@/lib/astraura-bots/capa-pantalla';
import { validarUiSpec } from '@/lib/nucleo/ui-spec';

describe('capa-pantalla', () => {
  describe('normalizarCapa', () => {
    it('devuelve una capa normalizada válida para forma resaltar', () => {
      const args = { forma: 'resaltar' };
      const result = normalizarCapa(args);
      if ('problemas' in result) {
        fail(result.problemas.join(', '));
      } else {
        expect(result.forma).toBe('resaltar');
      }
    });

    it('devuelve una capa normalizada válida para forma nota con texto válido', () => {
      const args = { forma: 'nota', texto: 'Esta es una nota válida' };
      const result = normalizarCapa(args);
      if ('problemas' in result) {
        fail(result.problemas.join(', '));
      } else {
        expect(result.forma).toBe('nota');
        expect(result.texto).toBe('Esta es una nota válida');
      }
    });

    it('devuelve problemas para forma widget sin uiSpec', () => {
      const args = { forma: 'widget' };
      const result = normalizarCapa(args);
      expect('problemas' in result).toBe(true);
      if ('problemas' in result) {
        expect(result.problemas).toContain('El widget requiere una uiSpec');
      }
    });

    it('devuelve problemas para forma widget con uiSpec inválida', () => {
      const uiSpecInvalida = { version: 0 }; // versión inválida
      const args = { forma: 'widget', uiSpec: uiSpecInvalida };
      const result = normalizarCapa(args);
      expect('problemas' in result).toBe(true);
      if ('problemas' in result) {
        expect(result.problemas).toContain('La uiSpec del widget es inválida');
      }
    });

    it('devuelve problemas para texto con código', () => {
      const args = { forma: 'nota', texto: '<script>alert(1)</script>' };
      const result = normalizarCapa(args);
      expect('problemas' in result).toBe(true);
      if ('problemas' in result) {
        expect(result.problemas).toContain('El texto no debe contener código');
      }
    });

    it('devuelve problemas para texto demasiado largo', () => {
      const textoLargo = 'a'.repeat(281);
      const args = { forma: 'nota', texto: textoLargo };
      const result = normalizarCapa(args);
      expect('problemas' in result).toBe(true);
      if ('problemas' in result) {
        expect(result.problemas).toContain('El texto no debe exceder los 280 caracteres');
      }
    });

    it('devuelve problemas para objetivo no string', () => {
      const args = { forma: 'nota', objetivo: 123 };
      const result = normalizarCapa(args);
      expect('problemas' in result).toBe(true);
      if ('problemas' in result) {
        expect(result.problemas).toContain('El objetivo debe essere una cadena de texto');
      }
    });

    it('devuelve problemas para forma no válida', () => {
      const args = { forma: 'invalida' as any };
      const result = normalizarCapa(args);
      expect('problemas' in result).toBe(true);
      if ('problemas' in result) {
        expect(result.problemas).toContain('La forma debe ser "resaltar", "nota", "flecha" o "widget"');
      }
    });
  });

  describe('crearCapa', () => {
    it('asigna un id y timestamp a una capa normalizada', () => {
      const normalizada: CapaNormalizada = { forma: 'resaltar' };
      const capa = crearCapa(normalizada);
      expect(capa).toHaveProperty('id');
      expect(typeof capa.id).toBe('string');
      expect(capa.id.length).toBeGreaterThan(0);
      expect(capa).toHaveProperty('timestamp');
      expect(typeof capa.timestamp).toBe('number');
      expect(capa.timestamp).toBeGreaterThan(0);
      expect(capa.forma).toBe('resaltar');
    });
  });

  describe('apilar', () => {
    it('mantiene un máximo de 8 capas, descartando la más antigua', () => {
      const capas: Capa[] = [];
      // Crear 8 capas con timestamps decrecientes (la primera es la más antigua)
      for (let i = 0; i < 8; i++) {
        const normalizada: CapaNormalizada = { forma: 'resaltar' };
        const capa = crearCapa(normalizada);
        // Sobrescribimos el timestamp para que sean decrecientes
        capa.timestamp = Date.now() - i * 1000;
        capas.push(capa);
      }
      // Ordenar por timestamp ascendente (el primero es el más antiguo)
      capas.sort((a, b) => a.timestamp - b.timestamp);

      const nuevaNormalizada: CapaNormalizada = { forma: 'nota' };
      const nueva = crearCapa(nuevaNormalizada);
      nueva.timestamp = Date.now(); // más reciente

      const resultado = apilar(capas, nueva);

      // Debemos tener 8 capas
      expect(resultado.length).toBe(8);
      // La capa más antigua (la que tenía el timestamp más pequeño) debe haber sido eliminada
      const ids = resultado.map((c) => c.id);
      expect(ids).not.toContain(capas[0].id); // la más antigua
      // La nueva capa debe estar presente
      expect(ids).toContain(nueva.id);
    });
  });

  describe('retirarPorId', () => {
    it('elimina la capa con el id especificado', () => {
      const capa1: Capa = { forma: 'resaltar', id: '1', timestamp: 0 };
      const capa2: Capa = { forma: 'nota', id: '2', timestamp: 0 };
      const capas = [capa1, capa2];

      const resultado = retirarPorId(capas, '1');
      expect(resultado.length).toBe(1);
      expect(resultado[0].id).toBe('2');
    });
  });
});

function fail(message: string): never {
  throw new Error(message);
}