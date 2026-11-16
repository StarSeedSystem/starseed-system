import { describe, it, expect } from 'vitest'
import { adaptadorLoRaMNalla, Radio, LoraMedio, EnlaceMapa } from '../lora-malla'

describe('adaptadorLoRaMNalla', () => {
  it('devuelve sinFuente cuando no hay radio conectado', () => {
    const radio: Radio = { isConnected: false }
    const lora: LoraMedio = { estado: '', transporte: '', nodos: [] }
    const enlaces: EnlaceMapa[] = []
    const signals = adaptadorLoRaMNalla(radio, lora, enlaces)
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({ tipo: 'lora', fuente: 'sinFuente' })
  })

  it('con radio y region EU devuelve banda y freq', () => {
    const radio: Radio = { isConnected: true, band: 'EU' }
    const lora: LoraMedio = { estado: '', transporte: '', nodos: [{ id: 'n1', snr: 10 }] }
    const enlaces: EnlaceMapa[] = []
    const signals = adaptadorLoRaMNalla(radio, lora, enlaces)
    expect(signals[0]).toMatchObject({ tipo: 'lora', banda: 'EU868', freq: 868.0 })
    expect(signals[0].quality).toBeCloseTo(10)
  })

  it('enlaces malla se añaden sin banda/freq', () => {
    const radio: Radio = { isConnected: true, band: 'EU' }
    const lora: LoraMedio = { estado: '', transporte: '', nodos: [] }
    const enlaces: EnlaceMapa[] = [{ id: 'e1', rttMs: 120, capacidadKbps: 512 }]
    const signals = adaptadorLoRaMNalla(radio, lora, enlaces)
    expect(signals).toHaveLength(2)
    const malla = signals.find(s => s.tipo === 'malla')
    expect(malla).toMatchObject({ tipo: 'malla', rttMs: 120, capacidadKbps: 512 })
  })
})
