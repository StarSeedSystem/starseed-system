// Pruebas de la salida a internet: puerta solo para lo público sin destino, y ruta real hasta ella.
import { describe, it, expect } from 'vitest'
import { planSalida, necesitaSalirAInternet } from '../salida-internet'
import type { PuertaInternet, Solicitante } from '../puertas-internet'
import type { Cristal, Dato, Medio, NeuronaReticula, Reticula, SenalMedida, Tesela } from '../tipos'

const señal = (de: string, a: string, medio: Medio = 'wifi-lan'): SenalMedida => ({
  de, a, medio, rssiDbm: -50, snrDb: 20, rttMs: 50, anchoBandaKbps: 100000, perdidaPct: 0, vistaEn: 1,
})

function neurona(id: string, cuenta = 'cuentaA'): NeuronaReticula {
  return { id, cuenta, capacidad: { ramGb: 4, bateriaPct: 80, cargando: false }, medios: ['wifi-lan'] }
}

function reticula(...senales: SenalMedida[]): Reticula {
  const teselas: Record<string, Tesela> = {}
  for (const s of senales) {
    teselas[s.de] = { origen: s.de, reloj: 1, neurona: neurona(s.de), senales: [...(teselas[s.de]?.senales ?? []), s] }
  }
  return { teselas }
}

function cristal(...pares: Array<[string, string]>): Cristal {
  return {
    puentes: pares.map(([a, b]) => ({ a, b, medio: 'wifi-lan', coste: 0.5 })),
    estado: 'vitreo', temperatura: {}, huella: 'prueba', coordinacion: {},
  }
}

function dato(over: Partial<Dato> = {}): Dato {
  return { id: 'd1', clase: 'publico', tipo: 'mensaje', bytes: 100, prioridad: 1, origen: 'a', destino: 'b', ...over }
}

function puerta(over: Partial<PuertaInternet> = {}): PuertaInternet {
  return {
    id: 'p1', neurona: 'c', cuenta: 'cuentaB', tipo: 'wifi-externa',
    bajadaKbps: 1000, subidaKbps: 1000, latenciaMs: 100, medida: false,
    compartir: 'publico', ...over,
  }
}

const solicitante: Solicitante = { cuenta: 'solicitante', vinculado: false, grupos: [] }

const ctx = {
  cuentaDe: (id: string) => (id === 'z' ? 'cuentaB' : 'cuentaA'),
  bateriaPct: 80 as number | null,
  cifradoE2E: true,
}

describe('salida-internet', () => {
  it('un dato privado nunca usa puerta y va por la malla P2P', () => {
    const e = {
      cristal: cristal(['a', 'b']),
      reticula: reticula(señal('a', 'b')),
      dato: dato({ clase: 'privado', destino: 'b' }),
      ctx, puertas: [puerta()], solicitante,
    }
    const plan = planSalida(e)
    expect(necesitaSalirAInternet(e.dato)).toBe(false)
    expect(plan.puerta).toBeNull()
    expect(plan.motivo).toBe('va por la malla P2P')
    expect(plan.ruta?.saltos).toEqual(['a', 'b'])
  })

  it('un dato interno entre neuronas tampoco usa puerta', () => {
    const plan = planSalida({
      cristal: cristal(['a', 'b']),
      reticula: reticula(señal('a', 'b')),
      dato: dato({ clase: 'interno', destino: 'b' }),
      ctx, puertas: [puerta()], solicitante,
    })
    expect(plan.puerta).toBeNull()
    expect(plan.motivo).toBe('va por la malla P2P')
  })

  it('un dato público sin destino elige la puerta alcanzable más barata', () => {
    const barata = puerta({ id: 'p-c', neurona: 'c', medida: true, topeMensualMb: 100, usadoMesMb: 10 })
    const cara = puerta({ id: 'p-cara', neurona: 'c', medida: true, topeMensualMb: 100, usadoMesMb: 95, bajadaKbps: 9000 })
    const plan = planSalida({
      cristal: cristal(['a', 'b'], ['b', 'c']),
      reticula: reticula(señal('a', 'b'), señal('b', 'c')),
      dato: dato({ destino: null }),
      ctx, puertas: [cara, barata], solicitante,
    })
    expect(plan.puerta?.id).toBe('p-c')
    expect(plan.ruta?.saltos).toEqual(['a', 'b', 'c'])
    expect(plan.ruta?.saltos[2]).toBe('c')
  })

  it('una puerta inalcanzable en la malla se salta a la siguiente permitida', () => {
    const barataLejana = puerta({ id: 'p-lejos', neurona: 'z', medida: true, topeMensualMb: 100, usadoMesMb: 10 })
    const despues = puerta({ id: 'p-cerca', neurona: 'c', medida: true, topeMensualMb: 100, usadoMesMb: 50 })
    const plan = planSalida({
      cristal: cristal(['a', 'b'], ['b', 'c']),
      reticula: reticula(señal('a', 'b'), señal('b', 'c')),
      dato: dato({ destino: null }),
      ctx, puertas: [barataLejana, despues], solicitante,
    })
    expect(plan.puerta?.id).toBe('p-cerca')
    expect(plan.ruta?.saltos).toEqual(['a', 'b', 'c'])
  })

  it('sin ninguna puerta alcanzable lo dice con un motivo claro', () => {
    const plan = planSalida({
      cristal: cristal(['a', 'b']),
      reticula: reticula(señal('a', 'b')),
      dato: dato({ destino: null }),
      ctx, puertas: [puerta({ neurona: 'z' })], solicitante,
    })
    expect(plan.puerta).toBeNull()
    expect(plan.ruta).toBeNull()
    expect(plan.motivo).toBe('ninguna puerta permitida es alcanzable por la malla')
  })
})
