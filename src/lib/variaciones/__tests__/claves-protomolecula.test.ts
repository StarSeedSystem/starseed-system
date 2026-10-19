import { describe, it, expect, beforeEach } from 'vitest';
import {
  claveDeHerramienta,
  claveDeAtomo,
  claveDeMolecula,
  atributosClave
} from '../claves-protomolecula';
import { limpiarRegistro, registrarAtomo } from '../../protomolecula/registro-atomos';
import { SINTETIZADOR } from '../../protomolecula/atomos/sintetizador';

// Configurar jsdom para pruebas de DOM (si se necesita)
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;

describe('claves-protomolecula', () => {
  describe('claveDeHerramienta', () => {
    it('should return null for invalid input', () => {
      expect(claveDeHerramienta(null)).toBeNull();
      expect(claveDeHerramienta(undefined)).toBeNull();
      expect(claveDeHerramienta(123)).toBeNull();
      expect(claveDeHerramienta('')).toBeNull();
    });

    it('should return null for invalid tool ID', () => {
      expect(claveDeHerramienta('invalid-tool-id')).toBeNull();
    });

    it('should return the correct key for a valid tool ID', () => {
      // We know that 'photocraft' is a valid tool ID from the catalog
      const result = claveDeHerramienta('photocraft');
      expect(result).toBe('herramienta:photocraft');
    });
  });

  describe('claveDeAtomo', () => {
    beforeEach(() => {
      limpiarRegistro();
      // Register the sintetizador atom for testing
      registrarAtomo(SINTETIZADOR);
    });

    it('should return null for invalid input', () => {
      expect(claveDeAtomo(null)).toBeNull();
      expect(claveDeAtomo(undefined)).toBeNull();
      expect(claveDeAtomo(123)).toBeNull();
      expect(claveDeAtomo('')).toBeNull();
    });

    it('should return null for invalid atom ID', () => {
      expect(claveDeAtomo('invalid-atom-id')).toBeNull();
    });

    it('should return the correct key for a valid atom ID', () => {
      // We know that 'sintetizador-web-audio' is a valid atom ID from the registro
      const result = claveDeAtomo('sintetizador-web-audio');
      expect(result).toBe('atomo:sintetizador-web-audio');
    });
  });

  describe('claveDeMolecula', () => {
    it('should return null for invalid input', () => {
      expect(claveDeMolecula(null)).toBeNull();
      expect(claveDeMolecula(undefined)).toBeNull();
      expect(claveDeMolecula(123)).toBeNull();
      expect(claveDeMolecula('')).toBeNull();
    });

    it('should return null for invalid molecule ID (does not match pattern)', () => {
      expect(claveDeMolecula('InvalidID')).toBeNull(); // starts with uppercase
      expect(claveDeMolecula('id con espacios')).toBeNull(); // contains space
      expect(claveDeMolecula('id#')).toBeNull(); // contains hash
      expect(claveDeMolecula('a'.repeat(65))).toBeNull(); // too long (65 chars)
    });

    it('should return the correct key for a valid molecule ID', () => {
      expect(claveDeMolecula('valid-id')).toBe('molecula:valid-id');
      expect(claveDeMolecula('valid-id-123')).toBe('molecula:valid-id-123');
      expect(claveDeMolecula('valid.id')).toBe('molecula:valid.id');
      expect(claveDeMolecula('valid_id')).toBe('molecula:valid_id');
      expect(claveDeMolecula('a'.repeat(64))).toBe('molecula:' + 'a'.repeat(64)); // exactly 64 chars
    });
  });

  describe('atributosClave', () => {
    it('should return null for invalid input', () => {
      expect(atributosClave(null)).toBeNull();
      expect(atributosClave(undefined)).toBeNull();
      expect(atributosClave(123)).toBeNull();
      expect(atributosClave('')).toBeNull();
    });

    it('should return null for invalid clave format', () => {
      expect(atributosClave('invalidclave')).toBeNull(); // missing :
      expect(atributosClave('invalid:')).toBeNull(); // missing id
      expect(atributosClave(':invalid')).toBeNull(); // missing familia
      expect(atributosClave('invalid clave')).toBeNull(); // space instead of :
      expect(atributosClave('INVALID:clave')).toBeNull(); // uppercase not allowed
      expect(atributosClave('valid:clave#')).toBeNull(); // empty parte
    });

    it('should return the correct attributes for a valid clave', () => {
      const clave = 'herramienta:photocraft';
      const result = atributosClave(clave);
      expect(result).toEqual({ 'data-ss-elemento': clave });
    });

    it('should return the correct attributes for a valid clave with parte', () => {
      const clave = 'atomo:sintetizador-web-audio#volumen';
      const result = atributosClave(clave);
      expect(result).toEqual({ 'data-ss-elemento': clave });
    });
  });
});