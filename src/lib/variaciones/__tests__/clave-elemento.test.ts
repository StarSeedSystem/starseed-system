import { describe, it, expect } from 'vitest';
import { 
  ClaveElemento, 
  crearClave, 
  leerClave, 
  claveDesdeElemento 
} from '../clave-elemento';

// Configurar jsdom para pruebas de DOM
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;

describe('clave-elemento', () => {
  describe('crearClave', () => {
    it('should create a basic clave without parte', () => {
      const clave = crearClave('widget', 'clima');
      expect(clave).toBe('widget:clima');
    });

    it('should create a clave with parte', () => {
      const clave = crearClave('post', '123', 'estilo');
      expect(clave).toBe('post:123#estilo');
    });
  });

  describe('leerClave', () => {
    it('should parse a valid clave without parte', () => {
      const clave = leerClave('widget:clima');
      expect(clave).toBe('widget:clima');
    });

    it('should parse a valid clave with parte', () => {
      const clave = leerClave('post:123#estilo');
      expect(clave).toBe('post:123#estilo');
    });

    it('should return null for invalid format', () => {
      expect(leerClave('widgetclima')).toBeNull(); // missing :
      expect(leerClave('widget:')).toBeNull(); // missing id
      expect(leerClave(':clima')).toBeNull(); // missing familia
      expect(leerClave('widget clima')).toBeNull(); // space instead of :
      expect(leerClave('WIDGET:clima')).toBeNull(); // uppercase not allowed
      expect(leerClave('widget:cl ima')).toBeNull(); // space in id
      expect(leerClave('widget:clima#')).toBeNull(); // empty parte
    });
  });

  describe('claveDesdeElemento', () => {
    it('should return null for null element', () => {
      const clave = claveDesdeElemento(null);
      expect(clave).toBeNull();
    });

    it('should extract clave from data-ss-elemento', () => {
      const el = document.createElement('div');
      el.setAttribute('data-ss-elemento', 'widget:clima');
      
      const clave = claveDesdeElemento(el);
      expect(clave).toBe('widget:clima');
    });

    it('should extract clave from data-widget-fn', () => {
      const el = document.createElement('div');
      el.setAttribute('data-widget-fn', 'clima');
      
      const clave = claveDesdeElemento(el);
      expect(clave).toBe('widget:clima');
    });

    it('should extract clave from data-widget-e', () => {
      const el = document.createElement('div');
      el.setAttribute('data-widget-e', 'clima');
      
      const clave = claveDesdeElemento(el);
      expect(clave).toBe('widget:clima');
    });

    it('should extract clave from data-ss-background', () => {
      const el = document.createElement('div');
      el.setAttribute('data-ss-background', 'aurora');
      
      const clave = claveDesdeElemento(el);
      expect(clave).toBe('fondo:aurora');
    });

    it('should extract clave from data-ss-material', () => {
      const el = document.createElement('div');
      el.setAttribute('data-ss-material', 'apariencia.radio');
      
      const clave = claveDesdeElemento(el);
      expect(clave).toBe('ajuste:apariencia.radio');
    });

    it('should extract clave from data-elemento', () => {
      const el = document.createElement('div');
      el.setAttribute('data-elemento', 'genesis');
      
      const clave = claveDesdeElemento(el);
      expect(clave).toBe('widget:genesis');
    });

    it('should traverse up the DOM to find clave', () => {
      // Create ancestor element with the clave
      const ancestor = document.createElement('div');
      ancestor.setAttribute('data-ss-elemento', 'tema:synthwave');
      
      // Create descendant element
      const descendant = document.createElement('div');
      
      // Build the tree: ancestor -> descendant
      ancestor.appendChild(descendant);
      
      // Attach to document so parentElement properties work correctly
      document.body.appendChild(ancestor);
      
      // Call claveDesdeElemento on the descendant - should go up to find the ancestor's attribute
      const clave = claveDesdeElemento(descendant);
      expect(clave).toBe('tema:synthwave');
      
      // Clean up
      document.body.removeChild(ancestor);
    });

    it('should return null when no clave found in DOM tree', () => {
      const el = document.createElement('div');
      // No data attributes set
      
      const clave = claveDesdeElemento(el);
      expect(clave).toBeNull();
    });
  });
});