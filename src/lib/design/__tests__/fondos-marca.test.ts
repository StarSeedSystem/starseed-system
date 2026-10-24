import { describe, it, expect } from 'vitest'
import { BACKGROUND_REGISTRY, listBackgrounds, getBackgroundDef, type BackgroundDef } from '../backgrounds'
import { fondoPara, type Registro, type Contexto } from '../sombras-fondos'

/* Fondos de la marca (decisión de Alex 2026-10-19): cada entrada del registro
 * debe derivar su token de `fondoPara` (sombras-fondos.ts), de modo que el
 * catálogo de fondos y el resguardo de registros nunca discrepen. */

interface FondoMarca {
  id: string
  registro: Registro
  contexto: Contexto
}

const FONDOS_MARCA: FondoMarca[] = [
  { id: 'vacio-profundo', registro: 'astraura', contexto: 'cosmico' },
  { id: 'degradado-claridad', registro: 'claridad', contexto: 'interfaz' },
  { id: 'degradado-profundidad', registro: 'profundidad', contexto: 'interfaz' },
  { id: 'degradado-natural', registro: 'natural', contexto: 'interfaz' },
  { id: 'degradado-cristal', registro: 'cristal', contexto: 'interfaz' },
]

const IDS_BUILTIN = ['matrix-rain', 'estrellas', 'gradiente-aurora', 'weather-live']

describe('fondos de la marca en el registro', () => {
  it('las cinco entradas de marca existen y usan el token de fondoPara', () => {
    for (const f of FONDOS_MARCA) {
      const entrada: BackgroundDef | null = getBackgroundDef(f.id)
      expect(entrada).not.toBeNull()
      const tokenEsperado = fondoPara(f.registro, f.contexto).background
      expect(entrada?.description).toContain(tokenEsperado)
      expect(entrada?.name.length).toBeGreaterThan(0)
    }
  })

  it('los fondos vivos o degradados dicen el velo y los contrastados no', () => {
    // Sobre degradado con texto encima toca velo (decisión 2026-10-19, §5).
    expect(BACKGROUND_REGISTRY['vacio-profundo'].description).toContain('velo')
    expect(BACKGROUND_REGISTRY['degradado-profundidad'].description).toContain('velo')
    expect(BACKGROUND_REGISTRY['degradado-natural'].description).toContain('velo')
    expect(BACKGROUND_REGISTRY['degradado-cristal'].description).toContain('velo')
    // Claridad es un fondo claro que ya pasa 4.5:1: sin velo.
    expect(BACKGROUND_REGISTRY['degradado-claridad'].description).not.toContain('velo')
  })

  it('las entradas de marca no rompen las builtin del registro', () => {
    expect(IDS_BUILTIN.map((id) => getBackgroundDef(id))).toEqual(IDS_BUILTIN.map((id) => BACKGROUND_REGISTRY[id]))
    for (const id of IDS_BUILTIN) {
      expect(BACKGROUND_REGISTRY[id].id).toBe(id)
    }
    expect(new Set(listBackgrounds().map((b) => b.id)).size).toBe(9)
  })

  it('los ids consultados siguen respondiendo null cuando no existen', () => {
    expect(getBackgroundDef(null)).toBeNull()
    expect(getBackgroundDef(undefined)).toBeNull()
    expect(getBackgroundDef('no-existe')).toBeNull()
  })
})
