import { describe, it, expect } from 'vitest';
import { 
  PRINCIPIOS_USABILIDAD, 
  REGlas_REDACCION, 
  revisarTexto,
  AvisoTexto
} from '../principios-referencia';

describe('principios-referencia', () => {
  describe('PRINCIPIOS_USABILIDAD', () => {
    it('debe contener 8 principios de usabilidad', () => {
      expect(PRINCIPIOS_USABILIDAD).toHaveLength(8);
    });
    
    it('cada principio debe tener id, titulo, descripcion y referencia', () => {
      PRINCIPIOS_USABILIDAD.forEach(principio => {
        expect(principio.id).toBeTypeOf('string');
        expect(principio.titulo).toBeTypeOf('string');
        expect(principio.descripcion).toBeTypeOf('string');
        expect(principio.referencia).toBe('dont-make-me-think');
      });
    });
  });

  describe('REGlas_REDACCION', () => {
    it('debe contener 8 reglas de redacción', () => {
      expect(REGlas_REDACCION).toHaveLength(8);
    });
    
    it('cada regla debe tener id, titulo, descripcion y referencia', () => {
      REGlas_REDACCION.forEach(regla => {
        expect(regla.id).toBeTypeOf('string');
        expect(regla.titulo).toBeTypeOf('string');
        expect(regla.descripcion).toBeTypeOf('string');
        expect(regla.referencia).toBe('asd-ste100');
      });
    });
  });

  describe('revisarTexto', () => {
    it('debe devolver un array vacío para texto válido', () => {
      const texto = 'Esta es una frase corta y clara.';
      const resultado = revisarTexto(texto);
      expect(resultado).toEqual([]);
    });

    it('debe detectar frases demasiado largas', () => {
      const texto = 'Esta es una frase extremadamente larga que supera ampliamente el límite recomendado de veinte palabras para mantener una buena legibilidad y comprensión.';
      const resultado = revisarTexto(texto);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].tipo).toBe('longitud');
    });

    it('debe detectar voz pasiva', () => {
      const texto = 'El botón fue presionado por el usuario.';
      const resultado = revisarTexto(texto);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].tipo).toBe('pasiva');
    });

    it('debe detectar jerga técnica', () => {
      const texto = 'Necesitamos utilizar esta funcionalidad para leveragesinergies.';
      const resultado = revisarTexto(texto);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].tipo).toBe('jerga');
    });

    it('debe detectar múltiples problemas en un texto', () => {
      const texto = 'El sistema fue implementado para utilizaruna sinergia máxima. Esta frase es extremadamente larga y contiene mucha jerga técnica que dificulta la comprensión.';
      const resultado = revisarTexto(texto);
      // Esperamos varios avisos: pasiva, jerga, longitud
      expect(resultado.length).toBeGreaterThanOrEqual(3);
    });
  });
});