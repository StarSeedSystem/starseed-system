// Sugerencias automáticas para compartir internet por la malla.
// Módulo puro: sin node, sin red ni Supabase. El automático nunca enciende
// lo que el dueño no encendió y jamás sube el nivel que el dueño dejó.
import { restanteParaOtrosMb } from './cristal/puertas-internet';
import type { Compartir, PuertaInternet } from './cristal/puertas-internet';

/** Preferencias que el dueño deja para este aparato (MRI2 las completa). */
export interface PreferenciasRedCompartida {
  /** Interruptor por aparato. Apagado de fábrica. */
  encendido: boolean;
  /** Nivel máximo de «con quién» que el dueño dejó como tope. */
  maximo: Compartir;
  /** Solo compartir cuando el aparato está en Wi-Fi. */
  soloWifi: boolean;
  /** Subida máxima que se está dispuesto a prestar, en kbps. */
  kbpsSubidaMax: number;
  /** Permiso explícito para ofrecer puertas con datos medidos. */
  permitirMedidas: boolean;
  /** Tope de datos de una conexión medida, en MB. */
  topeDatosMb?: number;
  /** Reserva de batería; por defecto 30 %. */
  reservaBateriaPct?: number;
}
export interface EstadoRedCompartida {
  enWifi: boolean;
  cargando: boolean;
  bateriaPct: number | null;
  medida: boolean;
  usoMb: number;
}

export interface DecisionComparticion {
  puertaId: string;
  con: Compartir;
  accion: 'ofrecer' | 'retirar' | 'mantener';
  motivo: string;
}
export interface EntradaSugerir {
  puertas: PuertaInternet[];
  preferencias: PreferenciasRedCompartida;
  estado: EstadoRedCompartida;
  ahora: number;
}

export const RESERVA_BATERIA_PCT = 30;

const ORDEN: Record<Compartir, number> = {
  nadie: 0,
  'mi-cuenta': 1,
  vinculos: 2,
  grupo: 3,
  publico: 4,
};

/** Devuelve el nivel más bajo de los dos: nunca sube lo que el dueño dejó. */
export function nivelMinimo(a: Compartir, b: Compartir): Compartir {
  return ORDEN[a] <= ORDEN[b] ? a : b;
}

function bloqueoFisico(
  pref: PreferenciasRedCompartida,
  estado: EstadoRedCompartida
): string | null {
  if (pref.soloWifi && !estado.enWifi) {
    return 'Solo se comparte por Wi-Fi y el aparato está en datos móviles';
  }
  const reserva = pref.reservaBateriaPct ?? RESERVA_BATERIA_PCT;
  if (estado.bateriaPct !== null && estado.bateriaPct < reserva && !estado.cargando) {
    return `Batería al ${estado.bateriaPct} % (reserva ${reserva} %) y el aparato no está cargando`;
  }
  if (estado.medida && pref.topeDatosMb !== undefined && estado.usoMb >= pref.topeDatosMb) {
    return `La conexión medida gastó ${estado.usoMb} MB de un tope de ${pref.topeDatosMb} MB`;
  }
  return null;
}

function decidirPuerta(
  puerta: PuertaInternet,
  pref: PreferenciasRedCompartida,
  estado: EstadoRedCompartida
): DecisionComparticion {
  const puertaId = puerta.id;
  if (!pref.encendido) {
    return puerta.compartir === 'nadie'
      ? { puertaId, con: 'nadie', accion: 'mantener', motivo: 'El interruptor del aparato está apagado: no se ofrece nada' }
      : { puertaId, con: 'nadie', accion: 'retirar', motivo: 'El interruptor del aparato está apagado: se retira la oferta' };
  }
  if (puerta.compartir === 'nadie') {
    return { puertaId, con: 'nadie', accion: 'mantener', motivo: 'La puerta está configurada para no compartir' };
  }
  const bloqueo = bloqueoFisico(pref, estado);
  if (bloqueo) return { puertaId, con: 'nadie', accion: 'retirar', motivo: bloqueo };
  if (puerta.medida && !pref.permitirMedidas) {
    return { puertaId, con: 'nadie', accion: 'retirar', motivo: 'La puerta usa datos medidos y el dueño no lo permitió explícitamente' };
  }
  if (puerta.medida) {
    const restante = restanteParaOtrosMb(puerta);
    if (restante !== null && restante <= 0) {
      return { puertaId, con: 'nadie', accion: 'retirar', motivo: 'No queda margen de datos para compartir en esta puerta medida' };
    }
  }
  if (pref.kbpsSubidaMax >= 0 && puerta.subidaKbps > pref.kbpsSubidaMax) {
    return { puertaId, con: 'nadie', accion: 'retirar', motivo: `La subida de la puerta (${puerta.subidaKbps} kbps) supera el tope de ${pref.kbpsSubidaMax} kbps` };
  }
  const con = nivelMinimo(puerta.compartir, pref.maximo);
  if (con === 'nadie') {
    return { puertaId, con: 'nadie', accion: 'retirar', motivo: 'El dueño dejó «nadie» como máximo para este aparato' };
  }
  if (ORDEN[puerta.compartir] > ORDEN[pref.maximo]) {
    return { puertaId, con, accion: 'ofrecer', motivo: `Se baja a «${con}»: el dueño no permite más que «${pref.maximo}»` };
  }
  return { puertaId, con, accion: 'ofrecer', motivo: `Se ofrece a «${con}»: interruptor encendido y topes en regla` };
}
export function sugerirComparticion(e: EntradaSugerir): {
  decisiones: DecisionComparticion[];
} {
  return { decisiones: e.puertas.map((p) => decidirPuerta(p, e.preferencias, e.estado)) };
}
