import { describe, it, expect } from 'vitest'
import { BACKGROUND_REGISTRY, listBackgrounds, getBackgroundDef } from '../backgrounds'
import { fondoPara } from '../sombras-fondos'

/** Los cinco fondos de marca que Alex aprobó (2026-10-19). */
const FONDOS_MARCA: { id: string; registro: string; contexto: string }[] = [
  { id: 'vacio-profundo', registro: 'vacio-profundo', contexto: 'cosmico' },
  { id: 'degradado-claridad', registro: 'degradado-claridad', contexto: 'interfaz' },
  { id: 'degradado-profundidad', registro: 'degradado-profundidad', contexto: 'interfaz' },
  { id: 'degradado-natural', registro: 'degradado-natural', contexto: 'interfaz' },
  { id: 'degradado-cristal', registro: 'degradado-cristal', contexto: 'interfaz' },
]

describe('fondos de marca en el registro', () => {
  it('los cinco fondos de marca existen en BACKGROUND_REGISTRY', () => {
    for (const { id } of FONDOS_MARCA) {
      expect(BACKGROUND_REGISTRY[id]).toBeDefined()
    }
  })

  it('cada fondo de marca lleva el token de sombras-fondos', () => {
    for (const { id, registro, contexto } of FONDOS_MARCA) {
      const fondo = BACKGROUND_REGISTRY[id]
      expect(fondo.token).toBe(fondoPara(registro, contexto).background)
    }
  })

  it('el velo de cada fondo coincide con la regla de sombras-fondos', () => {
    for (const { id, registro, contexto } of FONDOS_MARCA) {
      const fondo = BACKGROUND_REGISTRY[id]
      expect(fondo.velo).toBe(fondoPara(registro, contexto).velo)
    }
  })

  it('claridad es el único sin velo (ya es claro y sostiene el contraste)', () => {
    expect(BACKGROUND_REGISTRY['degradado-claridad'].velo).toBe(false)
    for (const { id } of FONDOS_MARCA) {
      if (id !== 'degradado-claridad') {
        expect(BACKGROUND_REGISTRY[id].velo).toBe(true)
      }
    }
  })

  it('los fondos builtin anteriores no se rompen', () => {
    for (const id of ['matrix-rain', 'estrellas', 'gradiente-aurora', 'weather-live']) {
      expect(getBackgroundDef(id)?.id).toBe(id)
      expect(getBackgroundDef(id)?.token).toBeUndefined()
      expect(getBackgroundDef(id)?.velo).toBeUndefined()
    }
  })

  it('listing y búsqueda siguen funcionando con el registro ampliado', () => {
    const todos = listBackgrounds()
    for (const { id } of FONDOS_MARCA) {
      expect(todos.some((f) => f.id === id)).toBe(true)
    }
    expect(getBackgroundDef(null)).toBeNull()
    expect(getBackgroundDef('no-existe')).toBeNull()
  })
})
