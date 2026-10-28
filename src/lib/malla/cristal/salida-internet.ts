// Salida a internet: ruta por la malla hasta la mejor puerta permitida (§8.1)
// Función pura: sin node:* ni Supabase ni window.
import { mejoresRutas } from './rutas'
import type { Ruta } from './rutas'
import { elegirPuerta } from './puertas-internet'
import type { PuertaInternet, Solicitante } from './puertas-internet'
import type { Cristal, Dato, Reticula } from './tipos'

export type CtxRutas = {
  cuentaDe: (neuronaId: string) => string | null
  bateriaPct?: number | null
  cifradoE2E: boolean
}

export interface EntradaSalida {
  cristal: Cristal
  reticula: Reticula
  dato: Dato
  ctx: CtxRutas
  puertas: PuertaInternet[]
  solicitante: Solicitante
  actual?: string
}

export interface PlanSalida {
  puerta: PuertaInternet | null
  ruta: Ruta | null
  motivo: string
}

// Necesita internet solo lo público difundido (sin neurona destino).
export function necesitaSalida(dato: Dato): boolean {
  return dato.destino === null && dato.clase === 'publico'
}

// Ruta desde el origen del dato hasta la neurona de la puerta:
// orientamos el dato a esa neurona y pedimos su mejor ruta al cristal.
export function rutaHastaPuerta(
  e: EntradaSalida, puerta: PuertaInternet
): Ruta | null {
  const dato: Dato = { ...e.dato, destino: puerta.neurona }
  const [mejor] = mejoresRutas(e.cristal, e.reticula, dato, e.ctx, 1)
  return mejor ?? null
}

// Plan de salida: puerta de menor coste permitida con ruta real por la malla.
export function planSalida(e: EntradaSalida): PlanSalida {
  // Sin salida necesaria: ruta normal hacia el destino, siempre por la malla P2P.
  if (!necesitaSalida(e.dato)) {
    const [ruta] = mejoresRutas(e.cristal, e.reticula, e.dato, e.ctx, 1)
    return { puerta: null, ruta: ruta ?? null, motivo: 'va por la malla P2P' }
  }

  // Necesita internet: elegimos puerta permitida y buscamos ruta hasta ella;
  // si la puerta elegida no es alcanzable, la saltamos y probamos la siguiente.
  const faltantes = new Set<string>()
  while (true) {
    const disponibles = e.puertas.filter((p) => !faltantes.has(p.id))
    const r = elegirPuerta({
      clase: e.dato.clase,
      necesitaInternet: true,
      puertas: disponibles,
      solicitante: e.solicitante,
      actual: faltantes.size === 0 ? e.actual : undefined,
    })
    if (!r.puerta) {
      const motivo = disponibles.length === 0
        ? 'Ninguna puerta permitida tiene ruta por la malla'
        : r.motivo
      return { puerta: null, ruta: null, motivo }
    }
    const ruta = rutaHastaPuerta(e, r.puerta)
    if (ruta) {
      return { puerta: r.puerta, ruta, motivo: `${r.motivo} por la puerta de ${r.puerta.neurona}` }
    }
    faltantes.add(r.puerta.id)
  }
}
