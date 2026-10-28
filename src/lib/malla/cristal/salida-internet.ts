// Salida a internet: ruta por la malla hasta la mejor puerta permitida (§8 y §8.1).
// Función pura: sin node:* ni Supabase ni window (se importa desde el navegador).
import {
  elegirPuerta,
  type PuertaInternet,
  type Solicitante,
} from './puertas-internet'
import { mejoresRutas, type Ruta } from './rutas'
import type { Cristal, Dato, Reticula } from './tipos'

// Contexto igual al de viabilidad y rutas: cuenta por neurona, batería y cifrado E2E.
export interface CtxSalida {
  cuentaDe: (neuronaId: string) => string | null
  bateriaPct?: number | null
  cifradoE2E: boolean
}

export interface PlanSalida {
  puerta: PuertaInternet | null
  ruta: Ruta | null
  motivo: string
}

export function necesitaSalirAInternet(dato: Dato): boolean {
  return dato.destino === null && dato.clase === 'publico'
}

// Mejor ruta en la malla hasta una neurona concreta (la del dato o la de una puerta).
function rutaHasta(
  cristal: Cristal,
  reticula: Reticula,
  dato: Dato,
  ctx: CtxSalida,
  destino: string | null,
): Ruta | null {
  const datoDirigido = destino ? { ...dato, destino } : dato
  return mejoresRutas(cristal, reticula, datoDirigido, ctx, 1)[0] ?? null
}

export interface EntradaPlanSalida {
  cristal: Cristal
  reticula: Reticula
  dato: Dato
  ctx: CtxSalida
  puertas: PuertaInternet[]
  solicitante: Solicitante
  actual?: string
}

export function planSalida(e: EntradaPlanSalida): PlanSalida {
  // Lo interno y lo privado entre neuronas nunca necesita puerta: va por la malla P2P (§8.1).
  if (!necesitaSalirAInternet(e.dato)) {
    const ruta = rutaHasta(e.cristal, e.reticula, e.dato, e.ctx, e.dato.destino)
    return { puerta: null, ruta, motivo: 'va por la malla P2P' }
  }

  // Necesita internet: se prueba la mejor puerta permitida y, si queda sin ruta
  // en la malla, se la descarta y se prueba la siguiente (siempre vía elegirPuerta).
  const restantes = [...e.puertas]
  while (restantes.length > 0) {
    const eleccion = elegirPuerta({
      clase: e.dato.clase,
      necesitaInternet: true,
      puertas: restantes,
      solicitante: e.solicitante,
      actual: e.actual,
    })
    if (!eleccion.puerta) break
    const ruta = rutaHasta(e.cristal, e.reticula, e.dato, e.ctx, eleccion.puerta.neurona)
    if (ruta) {
      return { puerta: eleccion.puerta, ruta, motivo: `salida a internet por la puerta ${eleccion.puerta.id}` }
    }
    const i = restantes.indexOf(eleccion.puerta)
    restantes.splice(i, 1)
  }

  return { puerta: null, ruta: null, motivo: 'ninguna puerta permitida es alcanzable por la malla' }
}
