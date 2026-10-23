import { describe, expect, it } from 'vitest';
import {
  AVISO_PESTANA_NUEVA,
  etiquetaEnlaceNuevaPestana,
} from '../aviso-pestana';

describe('anuncio de pestaña nueva en el rito', () => {
  it('añade el aviso de contexto al nombre accesible del enlace', () => {
    expect(etiquetaEnlaceNuevaPestana('Abrir Astraura AI')).toBe(
      'Abrir Astraura AI (se abre en una pestaña nueva)',
    );
  });

  it('conserva el texto visible como prefijo del nombre accesible', () => {
    expect(etiquetaEnlaceNuevaPestana('Visitar Dashboard').startsWith('Visitar Dashboard')).toBe(true);
  });

  it('no duplica el aviso si el texto ya lo contiene', () => {
    const yaAvisado = `Abrir ${AVISO_PESTANA_NUEVA}`;
    expect(etiquetaEnlaceNuevaPestana(yaAvisado)).toBe(yaAvisado);
  });

  it('mantiene el aviso entre paréntesis para que se anuncie como aclaración', () => {
    expect(AVISO_PESTANA_NUEVA).toBe('(se abre en una pestaña nueva)');
  });
});
