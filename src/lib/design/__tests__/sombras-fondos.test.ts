import { describe, it, expect } from 'vitest'
import { sombraPara, fondoPara } from '../sombras-fondos'

describe('sombras-fondos', () => {
  describe('sombraPara', () => {
    it('devuelve brillo solo para protagonista', () => {
      expect(sombraPara('protagonista')).toBe('--ss-sombra-brillo')
    })

    it('nunca devuelve brillo para lista, formulario o texto denso', () => {
      expect(sombraPara('lista')).not.toBe('--ss-sombra-brillo')
      expect(sombraPara('formulario')).not.toBe('--ss-sombra-brillo')
      expect(sombraPara('texto-denso')).not.toBe('--ss-sombra-brillo')
      expect(sombraPara('lista')).toBe('--ss-sombra-md')
      expect(sombraPara('formulario')).toBe('--ss-sombra-md')
      expect(sombraPara('texto-denso')).toBe('--ss-sombra-md')
    })

    it('usa sombra simple para widget y contenedor', () => {
      expect(sombraPara('widget')).toBe('--ss-sombra-md')
      expect(sombraPara('contenedor')).toBe('--ss-sombra-md')
    })

    it('usa sombra grande para panel y tarjeta', () => {
      expect(sombraPara('panel')).toBe('--ss-sombra-lg')
      expect(sombraPara('tarjeta')).toBe('--ss-sombra-lg')
    })
  })

  describe('fondoPara', () => {
    it('documento usa nieve sin velo', () => {
      const r = fondoPara('nexus', 'documento')
      expect(r.background).toBe('--ss-nieve')
      expect(r.velo).toBe(false)
    })

    it('astraura cosmico usa vacío profundo con velo', () => {
      const r = fondoPara('astraura', 'cosmico')
      expect(r.background).toBe('--ss-vacio-profundo')
      expect(r.velo).toBe(true)
    })

    it('natural usa fondo natural con velo', () => {
      const r = fondoPara('materia viva', 'interfaz')
      expect(r.background).toBe('--ss-fondo-natural')
      expect(r.velo).toBe(true)
    })

    it('claridad devuelve fondo claridad', () => {
      const r = fondoPara('claridad', 'interfaz')
      expect(r.background).toBe('--ss-fondo-claridad')
    })

    it('profundidad devuelve fondo profundidad con velo', () => {
      const r = fondoPara('profundidad', 'interfaz')
      expect(r.background).toBe('--ss-fondo-profundidad')
      expect(r.velo).toBe(true)
    })

    it('cristal devuelve fondo cristal con velo', () => {
      const r = fondoPara('cristal', 'interfaz')
      expect(r.background).toBe('--ss-fondo-cristal')
      expect(r.velo).toBe(true)
    })

    it('registro por defecto nexus usa noche sin velo', () => {
      const r = fondoPara('nexus', 'interfaz')
      expect(r.background).toBe('--ss-noche')
      expect(r.velo).toBe(false)
    })
  })
})
