import { describe, expect, it } from 'vitest'
import { CATALOGO_PROTOMOLECULA, herramientaPorId } from '../catalogo-herramientas'

describe('PixelArtistry Watertight Meshes catalog entry', () => {
  it('exists in the catalog', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta).not.toBeNull()
    expect(herramienta?.id).toBe('pixelartistry')
  })

  it('has correct category and type', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta?.categoria).toBe('modelado-3d')
    expect(herramienta?.tipo).toBe('app')
  })

  it('has correct origen and licencia', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta?.origen).toBe('github')
    expect(herramienta?.licencia).toBe('MIT')
  })

  it('has correct media properties', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta?.medios).toEqual({
      web: 'no',
      android: false,
      ios: false,
      macos: false,
      windows: true,
      linux: false,
      servidor: false
    })
  })

  it('has correct integracion', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta?.integracion).toBe('app-nativa-puente')
  })

  it('has correct formatos', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta?.formatos).toEqual({
      entrada: ['png', 'jpeg'],
      salida: ['glb', 'stl', '3mf']
    })
  })

  it('has correct estado and motivo', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta?.estado).toBe('integrable')
    expect(herramienta?.motivo).toContain('Windows con NVIDIA')
    expect(herramienta?.motivo).toContain('cierre por vóxeles de Blender')
  })

  it('has correct verificado date', () => {
    const herramienta = herramientaPorId('pixelartistry')
    expect(herramienta?.verificado).toBe('2026-10-11')
  })

  it('has correct avisos', () => {
    const herramienta = herramientaPorId('pixelartistry')
    const avisos = herramienta?.avisos ?? []
    expect(avisos).toContain('Nodos bajo licencias GPL-3.0 y MIT: solo como programa aparte.')
    expect(avisos).toContain('Solo Windows 10/11 con NVIDIA RTX 20+')
    expect(avisos).toContain('Umbrales de VRAM: 6 GB → 1024, 8 GB → 1536, 16 GB → 2048')
    expect(avisos).toContain('Proyecto muy nuevo (5 commits, sin versiones)')
  })
})