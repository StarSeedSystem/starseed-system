// Pruebas del plan de salida a internet (§8.1)
import { describe, it, expect } from 'vitest'
import { planSalida, necesitaSalida } from '../salida-internet'
import type { PuertaInternet, Solicitante } from '../puertas-internet'
import type { Cristal, Dato, NeuronaReticula, Reticula, SenalMedida, Tesela, Medio } from '../tipos'

const señal = (de: string, a: string, medio: Medio = 'wifi-lan'): SenalMedida => ({
  de, a, medio, rssiDbm: -50, snrDb: 20, rttMs: 50, anchoBandaKbps: 100000, perdidaPct: 0, vistaEn: 1,
})

function neurona(id: string): NeuronaReticula {
  return { id, cuenta: 'cuentaA', capacidad: { ramGb: 4, bateriaPct: 80, cargando: false }, medios: ['wifi-lan'] }
}

function reticula(...senales: SenalMedida[]): Reticula {
  const teselas: Record<string, Tesela> = {}
  for (const s of senales) {
    const previa = teselas[s.de]
    teselas[s.de] = { origen: s.de, reloj: 1, neurona: neurona(s.de), senales: [...(previa?.senales ?? []), s] }
  }
  return { teselas }
}

function cristal(...puentes: Array<[string, string]>): Cristal {
  return {
    puentes: puentes.map(([a, b]) => ({ a, b, medio: 'wifi-lan', coste: 0.5 })),
    estado: 'vitreo', temperatura: {}, huella: 'prueba', coordinacion: {},
  }
}

function dato(over: Partial<Dato> = {}): Dato {
  return { id: 'd1', clase: 'publico', tipo: 'mensaje', bytes: 100, prioridad: 1, origen: 'a', destino: 'b', ...over }
}

function puerta(id: string, neuronaId: string, over: Partial<PuertaInternet> = {}): PuertaInternet {
  return {
    id, neurona: neuronaId, cuenta: 'cuentaA', tipo: 'movil-4g',
    bajadaKbps: 10000, subidaKbps: 5000, latenciaMs: 100,
    medida: false, compartir: 'publico', ...over,
  }
}

const ctx = { cuentaDe: () => 'cuentaA', bateriaPct: 80, cifradoE2E: true }
const sol: Solicitante = { cuenta: 'cuentaA', vinculado: true, grupos: [] }

describe('necesitaSalida', () => {
  it('solo lo público sin destino necesita una puerta', () => {
    expect(necesitaSalida(dato({ destino: null }))).toBe(true)
    expect(necesitaSalida(dato())).toBe(false)
    expect(necesitaSalida(dato({ clase: 'privado', destino: null }))).toBe(false)
    expect(necesitaSalida(dato({ clase: 'interno', destino: null }))).toBe(false)
  })
})

describe('planSalida', () => {
  it('privado con destino va por la malla P2P sin puerta', () => {
    const p = planSalida({
      cristal: cristal(['a', 'b']), reticula: reticula(señal('a', 'b')), dato: dato({ clase: 'privado' }),
      ctx, puertas: [puerta('p1', 'b')], solicitante: sol,
    })
    expect(p.puerta).toBeNull()
    expect(p.ruta?.saltos).toEqual(['a', 'b'])
    expect(p.motivo).toBe('va por la malla P2P')
  })

  it('público con destino neurona también va por la malla P2P', () => {
    const p = planSalida({
      cristal: cristal(['a', 'b']), reticula: reticula(señal('a', 'b')), dato: dato(),
      ctx, puertas: [puerta('p1', 'b')], solicitante: sol,
    })
    expect(p.puerta).toBeNull()
    expect(p.ruta?.saltos).toEqual(['a', 'b'])
    expect(p.motivo).toBe('va por la malla P2P')
  })

  it('público difundido elige la puerta alcanzable de menor coste', () => {
    const barata = puerta('barata', 'gan')
    const p = planSalida({
      cristal: cristal(['a', 'gan']), reticula: reticula(señal('a', 'gan')), dato: dato({ destino: null }),
      ctx, puertas: [barata, puerta('cara', 'gan', { latenciaMs: 900, bajadaKbps: 100, subidaKbps: 100 })],
      solicitante: sol,
    })
    expect(p.puerta?.id).toBe('barata')
    expect(p.ruta?.saltos).toEqual(['a', 'gan'])
    expect(p.motivo).not.toBe('va por la malla P2P')
  })

  it('público difundido elige la puerta medida más barata aunque otra tenga más ancho, y la ruta llega en dos saltos', () => {
    const barata = puerta('p-c', 'c', { medida: true, topeMensualMb: 100, usadoMesMb: 10 })
    const cara = puerta('p-cara', 'c', { medida: true, topeMensualMb: 100, usadoMesMb: 95, bajadaKbps: 9000 })
    const p = planSalida({
      cristal: cristal(['a', 'b'], ['b', 'c']), reticula: reticula(señal('a', 'b'), señal('b', 'c')),
      dato: dato({ destino: null }), ctx, puertas: [cara, barata], solicitante: sol,
    })
    expect(p.puerta?.id).toBe('p-c')
    expect(p.ruta?.saltos).toEqual(['a', 'b', 'c'])
    expect(p.motivo).not.toBe('va por la malla P2P')
  })

  it('una puerta del cristal inalcanzable se salta y prueba la siguiente', () => {
    const p = planSalida({
      // 'iran' existe en el cristal pero no hay señal con la retícula: no apta
      cristal: cristal(['a', 'gan']), reticula: reticula(señal('a', 'lon')), dato: dato({ destino: null }),
      ctx, puertas: [puerta('ajena', 'iran'), puerta('buena', 'gan')],
      solicitante: sol,
    })
    expect(p.puerta?.id).toBe('buena')
    expect(p.ruta?.saltos).toEqual(['a', 'gan'])
  })

  it('un dato interno entre neuronas tampoco usa puerta', () => {
    const p = planSalida({
      cristal: cristal(['a', 'b']), reticula: reticula(señal('a', 'b')),
      dato: dato({ clase: 'interno' }), ctx, puertas: [puerta('p1', 'b')], solicitante: sol,
    })
    expect(p.puerta).toBeNull()
    expect(p.ruta?.saltos).toEqual(['a', 'b'])
    expect(p.motivo).toBe('va por la malla P2P')
  })

  it('sin puertas con ruta devuelve motivo claro y sin puerta', () => {
    const p = planSalida({
      cristal: cristal(['a', 'lon']), reticula: reticula(señal('a', 'lon')), dato: dato({ destino: null }),
      ctx, puertas: [puerta('p1', 'isl')], solicitante: sol,
    })
    expect(p.puerta).toBeNull()
    expect(p.ruta).toBeNull()
    expect(p.motivo).toBe('Ninguna puerta permitida tiene ruta por la malla')
  })
})
