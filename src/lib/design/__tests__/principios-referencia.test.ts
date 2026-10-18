import { describe, it, expect } from 'vitest'
import { PRINCIPIOS_USABILIDAD, REGLAS_REDACT_CLARA, revisarTexto } from '../principios-referencia'

describe('principios-referencia', () => {
  describe('PRINCIPIOS_USABILIDAD', () => {
    it('tiene 8 principios', () => {
      expect(PRINCIPIOS_USABILIDAD).toHaveLength(8)
    })
    it('cada principio tiene id, descripcion y referencia', () => {
      PRINCIPIOS_USABILIDAD.forEach(p => {
        expect(p).toHaveProperty('id')
        expect(p).toHaveProperty('descripcion')
        expect(p).toHaveProperty('referencia')
        expect(typeof p.id).toBe('string')
        expect(typeof p.descripcion).toBe('string')
        expect(typeof p.referencia).toBe('string')
      })
    })
    it('las referencias son dont-make-me-think', () => {
      PRINCIPIOS_USABILIDAD.forEach(p => {
        expect(p.referencia).toBe('dont-make-me-think')
      })
    })
  })

  describe('REGLAS_REDACT_CLARA', () => {
    it('tiene 8 reglas', () => {
      expect(REGLAS_REDACT_CLARA).toHaveLength(8)
    })
    it('cada regla tiene id, descripcion y referencia', () => {
      REGLAS_REDACT_CLARA.forEach(r => {
        expect(r).toHaveProperty('id')
        expect(r).toHaveProperty('descripcion')
        expect(r).toHaveProperty('referencia')
        expect(typeof r.id).toBe('string')
        expect(typeof r.descripcion).toBe('string')
        expect(typeof r.referencia).toBe('string')
      })
    })
    it('las referencias son asd-ste100', () => {
      REGLAS_REDACT_CLARA.forEach(r => {
        expect(r.referencia).toBe('asd-ste100')
      })
    })
  })

  describe('revisarTexto', () => {
    it('devuelve objeto con frasesLargas, pasivaFrecuente y jerga', () => {
      const resultado = revisarTexto('Hola mundo.')
      expect(resultado).toHaveProperty('frasesLargas')
      expect(resultado).toHaveProperty('pasivaFrecuente')
      expect(resultado).toHaveProperty('jerga')
    })
    it('cuenta frases largas correctamente', () => {
      const texto = 'Esta es una frase corta. ' +
                    'Esta es una frase que tiene más de veinte palabras y debería ser contada como larga porque supera el límite.'
      const resultado = revisarTexto(texto)
      expect(resultado.frasesLargas).toBe(1)
    })
    it('detecta pasiva simple', () => {
      const texto = 'Se hizo el trabajo. El proyecto se completó.'
      const resultado = revisarTexto(texto)
      expect(resultado.pasivaFrecuente).toBeGreaterThanOrEqual(2)
    })
    it('detecta jerga', () => {
      const texto = 'Vamos a aprovechar la sinergia de este disruptivo blockchain.'
      const resultado = revisarTexto(texto)
      expect(resultado.jerga).toContain('sinergia')
      expect(resultado.jerga).toContain('disruptivo')
      expect(resultado.jerga).toContain('blockchain')
    })
  })
})