import { describe, it, expect } from 'vitest'
import { destinosDe, DestinoAlmacen, Dato } from '../destinos-almacen'

describe('destinosDe', () => {
  const motorReales = ['putObjectToBackend', 'starseed', 'gcs', 'gdrive']
  const disponibles: DestinoAlmacen[] = [
    { id: '1', tipo: 'aparato', motor: 'putObjectToBackend', publico: false },
    { id: '2', tipo: 'cerebro', motor: 'starseed', publico: true, cerebroId: 'cerebro1' },
    { id: '3', tipo: 'biblioteca', motor: 'gcs', publico: false },
    { id: '4', tipo: 'servidor', motor: 'motorFicticio', publico: true },
    { id: '5', tipo: 'aparato', motor: 'motorFicticio', publico: false }, // aparato siempre válido
  ]

  it('should use elegidosPorDato when provided', () => {
    const dato: Dato = { clase: 'publico' }
    const result = destinosDe(dato, {
      politicaContexto: ['1', '2'], // ignored
      disponibles,
      elegidosPorDato: ['3', '1', '4'],
      motoresReales: motorReales
    })
    expect(result.guardar.map(d => d.id)).toEqual(['3', '1']) // 4 is discarded because motorFicticio not in motorReales and tipo is servidor
    expect(result.descartados).toEqual([{ id: '4', motivo: 'aún sin motor de guardado' }])
  })

  it('should use politicaContexto when elegidosPorDato not provided', () => {
    const dato: Dato = { clase: 'publico' }
    const result = destinosDe(dato, {
      politicaContexto: ['2', '3', '4'],
      disponibles,
      motoresReales: motorReales
    })
    expect(result.guardar.map(d => d.id)).toEqual(['2', '3']) // 4 discarded because motorFicticio not in motorReales and tipo servidor
    expect(result.descartados).toEqual([{ id: '4', motivo: 'aún sin motor de guardado' }])
  })

  it('should discard public destinations for privado dato', () => {
    const dato: Dato = { clase: 'privado' }
    const result = destinosDe(dato, {
      politicaContexto: [],
      disponibles,
      elegidosPorDato: ['1', '2', '3'],
      motoresReales: motorReales
    })
    expect(result.guardar.map(d => d.id)).toEqual(['1', '3']) // 2 is public
    expect(result.descartados).toEqual([{ id: '2', motivo: 'destino público no permitido para dato privado/interno' }])
  })

  it('should discard public destinations for interno dato', () => {
    const dato: Dato = { clase: 'interno' }
    const result = destinosDe(dato, {
      politicaContexto: [],
      disponibles,
      elegidosPorDato: ['1', '2', '3'],
      motoresReales: motorReales
    })
    expect(result.guardar.map(d => d.id)).toEqual(['1', '3']) // 2 is public
    expect(result.descartados).toEqual([{ id: '2', motivo: 'destino público no permitido para dato privado/interno' }])
  })

  it('should allow public destinations for publico dato', () => {
    const dato: Dato = { clase: 'publico' }
    const result = destinosDe(dato, {
      politicaContexto: [],
      disponibles,
      elegidosPorDato: ['2', '4'],
      motoresReales: motorReales
    })
    expect(result.guardar.map(d => d.id)).toEqual(['2']) // 4 discarded due to motor
    expect(result.descartados).toEqual([{ id: '4', motivo: 'aún sin motor de guardado' }])
  })

  it('should discard non-existent destination', () => {
    const dato: Dato = { clase: 'publico' }
    const result = destinosDe(dato, {
      politicaContexto: [],
      disponibles,
      elegidosPorDato: ['99'],
      motoresReales: motorReales
    })
    expect(result.guardar).toHaveLength(0)
    expect(result.descartados).toEqual([{ id: '99', motivo: 'no existe' }])
  })

  it('should preserve order', () => {
    const dato: Dato = { clase: 'publico' }
    const result = destinosDe(dato, {
      politicaContexto: [],
      disponibles,
      elegidosPorDato: ['3', '1', '2'],
      motoresReales: motorReales
    })
    expect(result.guardar.map(d => d.id)).toEqual(['3', '1', '2'])
    expect(result.descartados).toHaveLength(0)
  })

  it('should handle mixed reasons for discarding', () => {
    const dato: Dato = { clase: 'privado' }
    const result = destinosDe(dato, {
      politicaContexto: [],
      disponibles,
      elegidosPorDato: ['2', '4', '5', '99'],
      motoresReales: motorReales
    })
    // 2: public -> discarded for public
    // 4: motorFicticio and tipo servidor -> discarded for motor
    // 5: aparato with motorFicticio -> allowed (aparato siempre válido)
    // 99: no existe
    expect(result.guardar.map(d => d.id)).toEqual(['5'])
    expect(result.descartados).toEqual([
      { id: '2', motivo: 'destino público no permitido para dato privado/interno' },
      { id: '4', motivo: 'aún sin motor de guardado' },
      { id: '99', motivo: 'no existe' }
    ])
  })
})