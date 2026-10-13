import { describe, it, expect } from 'vitest'
import {
  DestinoTelepatia,
  VinculoTelepatico,
  CONFIGURACIONES_TELEPATIA,
  validarVinculo,
  normalizarVinculos,
  conVinculo,
  sinVinculo,
  estaCaducado,
  planSincronizacion
} from '../telepatia'

describe('telepatia', () => {
  describe('validarVinculo', () => {
    it('should reject non-object', () => {
      const result = validarVinculo(null)
      expect(result.ok).toBe(false)
      expect(result.motivo).toContain('no es un objeto')
    })
    it('should reject missing id', () => {
      const result = validarVinculo({})
      expect(result.ok).toBe(false)
      expect(result.motivo).toContain('id')
    })
  })

  describe('normalizarVinculos', () => {
    it('should return empty array for null or undefined', () => {
      expect(normalizarVinculos(null)).toEqual([])
      expect(normalizarVinculos(undefined)).toEqual([])
    })
  })

  describe('conVinculo and sinVinculo', () => {
    const baseVinculo: VinculoTelepatico = {
      id: 'v1',
      destino: { tipo: 'cerebro', id: 'c1' },
      alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] },
      direccion: 'enviar',
      acceso: 'leer',
      auto: false,
      estado: 'activo',
      creadoEn: '2024-01-01T00:00:00.000Z'
    }

    it('should add a vinculo', () => {
      const config = {}
      const result = conVinculo(config, baseVinculo)
      expect(result.telepatia).toEqual([baseVinculo])
    })

    it('should replace a vinculo with same id', () => {
      const v2: VinculoTelepatico = { ...baseVinculo, id: 'v1', destino: { ...baseVinculo.destino, id: 'c2' }, creadoEn: '2024-01-02T00:00:00.000Z' }
      const config = { telepatia: [baseVinculo] }
      const result = conVinculo(config, v2)
      expect(result.telepatia).toHaveLength(1)
      expect(result.telepatia[0]).toBe(v2)
    })

    it('should remove a vinculo by id', () => {
      const config = { telepatia: [baseVinculo] }
      const result = sinVinculo(config, 'v1')
      expect(result.telepatia).toEqual([])
    })
  })

  describe('estaCaducado', () => {
    it('should return false for null expiraEn', () => {
      const v: VinculoTelepatico = { id: 'v1', destino: { tipo: 'cerebro', id: 'c1' }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: 'enviar', acceso: 'leer', auto: false, estado: 'activo', creadoEn: '2024-01-01T00:00:00.000Z', expiraEn: null }
      expect(estaCaducado(v, Date.now())).toBe(false)
    })

    it('should return true for past expiraEn', () => {
      const past = new Date(Date.now() - 1000).toISOString()
      const v: VinculoTelepatico = { id: 'v1', destino: { tipo: 'cerebro', id: 'c1' }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: 'enviar', acceso: 'leer', auto: false, estado: 'activo', creadoEn: '2024-01-01T00:00:00.000Z', expiraEn: past }
      expect(estaCaducado(v, Date.now())).toBe(true)
    })
  })

  describe('planSincronizacion', () => {
    it('should return empty plan for paused vinculo', () => {
      const v: VinculoTelepatico = { id: 'v1', destino: { tipo: 'cerebro', id: 'c1' }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: 'enviar', acceso: 'leer', auto: false, estado: 'pausado', creadoEn: '2024-01-01T00:00:00.000Z' }
      const result = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} })
      expect(result).toEqual([])
    })
  })
})