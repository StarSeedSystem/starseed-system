// Adaptador puro para señales LoRa y malla
// Se exporta una función que convierte la información de radio y nodos en un arreglo de señales

export interface Radio {
  isConnected: boolean
  band?: string
  freq?: number
  preset?: number
}

export interface NodoMedio {
  id: string
  snr?: number
  rssi?: number
}

export interface LoraMedio {
  estado: string
  transporte: string
  nodos: NodoMedio[]
}

export interface EnlaceMapa {
  id: string
  rttMs?: number
  capacidadKbps?: number
}

export type Signal = {
  tipo: 'lora' | 'malla'
  fuente?: string
  banda?: string
  freq?: number
  quality?: number
  rttMs?: number
  capacidadKbps?: number
}

const bandasPorRegion: Record<string, {banda: string, freq: number}> = {
  'EU': {banda: 'EU868', freq: 868.0}
}

export function adaptadorLoRaMNalla(radios: Radio, lora: LoraMedio, enlaces: EnlaceMapa[]): Signal[] {
  const signals: Signal[] = []
  if (!radios.isConnected) {
    signals.push({tipo: 'lora', fuente: 'sinFuente'})
  } else {
    const region = radios.band
    const regionInfo = bandasPorRegion[region ?? '']
    if (regionInfo) {
      const quality = lora.nodos.length ? lora.nodos.reduce((acc, n) => acc + (n.snr ?? 0), 0) / lora.nodos.length : 0
      signals.push({
        tipo: 'lora',
        banda: regionInfo.banda,
        freq: regionInfo.freq,
        quality
      })
    }
  }
  enlaces.forEach(e => {
    signals.push({
      tipo: 'malla',
      rttMs: e.rttMs,
      capacidadKbps: e.capacidadKbps
    })
  })
  return signals
}
