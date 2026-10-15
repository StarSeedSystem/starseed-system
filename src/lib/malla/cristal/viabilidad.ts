// Malla cristalina SiO₂ amorfa: viabilidad de un enlace para un dato
// Función pura: sin node:* ni Supabase ni window

import { calidadSenal } from './coste'
import type { Dato, SenalMedida, Medio, ClaseDato, Prioridad, TipoDato } from './tipos'

export interface Viabilidad {
  valor: number
  apto: boolean
  motivo: string
}

/**
 * Evalúa la viabilidad de usar un enlace (señal medida) para transmitir un dato.
 * @param dato El dato a transmitir
 * @param s La señal medida del enlace (entre dos neuronas)
 * @param ctx Contexto que incluye función para obtener cuenta de una neurona, batería y cifrado E2E
 * @returns Objeto Viabilidad con valor entre 0 y 1, apto booleano y motivo en caso de no apto
 */
export function viabilidad(
  dato: Dato,
  s: SenalMedida,
  ctx: { cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean }
): Viabilidad {
  // Veto 1: 'interno' si alguna punta no es de la misma cuenta que el origen
  if (dato.clase === 'interno') {
    const cuentaOrigen = ctx.cuentaDe(dato.origen)
    if (cuentaOrigen === null) {
      // Si no podemos determinar la cuenta del origen, asumimos que no es interno válido
      return { valor: 0, apto: false, motivo: 'interno' }
    }
    const cuentaDe = ctx.cuentaDe(s.de)
    const cuentaA = ctx.cuentaDe(s.a)
    if (cuentaDe !== cuentaOrigen || cuentaA !== cuentaOrigen) {
      return { valor: 0, apto: false, motivo: 'interno' }
    }
  }

  // Veto 2: 'lora' con bytes > 200 × 8 o tipo 'llamada'
  if (s.medio === 'lora' && (dato.bytes > 200 * 8 || dato.tipo === 'llamada')) {
    return { valor: 0, apto: false, motivo: 'lora' }
  }

  // Veto 3: 'nfc' con bytes > 32768
  if (s.medio === 'nfc' && dato.bytes > 32768) {
    return { valor: 0, apto: false, motivo: 'nfc' }
  }

  // Veto 4: 'servidor' para 'privado'/'interno' solo si cifradoE2E (si no, veto)
  if (s.medio === 'servidor' && (dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return { valor: 0, apto: false, motivo: 'servidor' }
  }

  // Veto 5: 'privado' o 'interno' sin cifradoE2E
  if ((dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return { valor: 0, apto: false, motivo: dato.clase === 'privado' ? 'privado' : 'interno' }
  }

  // Si pasó todos los vetos, calculamos el valor
  const calidad = calidadSenal(s)
  
  // Factor de prioridad: P0 premia latencia, P3 premia ancho
  // Debido a falta de especificación, usamos una tabla razonable basada en el ancho de banda
  // Pero ajustamos para que P0 tenga un factor ligeramente mayor cuando la latencia es buena?
  // Sin embargo, la calidadSenal ya incluye latencia y ancho de banda.
  // Como compromiso, usamos el mismo peso que en reparto de ancho de banda pero invertido?
  // Vamos a usar: P0: 1.0, P1: 0.8, P2: 0.6, P3: 0.4 (decrementando) para probar.
  // Esto da más peso a P0, lo que podría ayudar a premium latencia si interpretamos que
  // un valor más alto es mejor y queremos que P0 sea más selectivo.
  const factorDePrioridad: Record<Prioridad, number> = {
    0: 1.0,
    1: 0.8,
    2: 0.6,
    3: 0.4,
  }
  const factor = factorDePrioridad[dato.prioridad]

  // Factor 0.6 si el medio es 'servidor' y la clase no es 'publico'
  let factorServidor = 1.0
  if (s.medio === 'servidor' && dato.clase !== 'publico') {
    factorServidor = 0.6
  }

   // Factor 0.8 si batería < 20 y el medio es de alto consumo (wifi-lan, webrtc)
   let factorBateria = 1.0
   if (ctx.bateriaPct != null && ctx.bateriaPct < 20) {
     if (s.medio === 'wifi-lan' || s.medio === 'webrtc') {
       factorBateria = 0.8
     }
   }

  const valor = calidad * factor * factorServidor * factorBateria
  // Aseguramos que el valor no exceda 1 (por si los factores lo aumentan, aunque en nuestro caso no)
  const valorFinal = Math.min(valor, 1.0)

  return {
    valor: valorFinal,
    apto: true,
    motivo: '' // motivo vacío cuando es apto
  }
}
