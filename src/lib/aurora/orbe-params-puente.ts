"use client";
/**
 * orbe-params-puente — cablea el bus `params` de la orbe con el canal `orb_params`.
 * ----------------------------------------------------------------------------
 * El bus local (`quantum-orb-bus.ts`, evento `params`) ya reparte el vector
 * visual (turbulence, spikiness, symmetry, hueShift, breath) entre las
 * superficies de ESTA pestaña, y `vector-por-clausula.ts` lo emite cláusula a
 * cláusula mientras BitNet 1.58b habla. Lo que faltaba era sacarlo al exterior:
 *  · lo que emite el bus se PUBLICA en el tema `orb_params` (Realtime, difusión
 *    y sin sondeo) → Nexus, el Exocortex y los agentes de otras neuronas
 *    reaccionan al estado interno del modelo EN VIVO, sin sondear;
 *  · lo que llega por ese tema se INYECTA en el bus local → la orbe de esta
 *    pestaña se mueve con lo que sienten las demás.
 *
 * El ida y vuelta está cortado por diseño (anti-eco): lo que acaba de llegar
 * del canal no se vuelve a publicar, y el eco exacto de lo ya publicado se
 * descarta. Sin ese corte, dos neuronas se reenviarían el mismo vector para
 * siempre y el tema `orb_params` se convertiría en un ping-pong sin fin.
 *
 * Sin React, sin `node:*` y sin reloj: el canal entra como dato, así que el
 * cableado se prueba con un canal falso (igual que `canal-orbe-params.ts`).
 * Quien lo monta es `realtime-sync-provider.tsx`, que ya es el punto de montaje
 * de los motores de tiempo real del RootLayout.
 */
import { emitQuantumOrbParams, onQuantumOrbParams } from "./quantum-orb-bus";
import { CLAVES_VECTOR_ORBE, type AnuncioParamsOrbe, type ClienteRealtimeMin } from "./orbe-params-telemetria";
import { crearCanalOrbeParams, type CanalOrbeParams } from "./canal-orbe-params";
import { mergeQuantumOrbParams, type QuantumOrbParams } from "./quantum-orb-theme";

/** Lo que el puente necesita del canal: publicar y escuchar sus anuncios. */
export type CanalOrbeMin = Pick<CanalOrbeParams, "publicar" | "suscribir">;

export interface PuenteOrbeParams {
  /** Suelta las dos suscripciones. Se llama al desmontar. */
  cerrar(): void;
}

/** Dos vectores son el mismo si coinciden las cinco claves COMPLETAS (partial = lo que no trae cuenta). */
export function mismoVectorOrbe(a: Partial<QuantumOrbParams>, b: Partial<QuantumOrbParams>): boolean {
  const va = mergeQuantumOrbParams(a);
  const vb = mergeQuantumOrbParams(b);
  return CLAVES_VECTOR_ORBE.every((k) => va[k] === vb[k]);
}

/**
 * Une el bus `params` con `canal` en los dos sentidos. Devuelve el desenganche:
 * sin llamarlo, la suscripción al bus seguiría viva aunque el canal se cierre.
 */
export function conectarPuenteOrbeParams(canal: CanalOrbeMin): PuenteOrbeParams {
  let desdeElCanal = false; // el siguiente emit del bus viene del canal: no se re-publica
  let publicado: Partial<QuantumOrbParams> | null = null;

  const bajaBus = onQuantumOrbParams((params) => {
    if (desdeElCanal) return;
    if (publicado && mismoVectorOrbe(publicado, params)) return;
    publicado = { ...params };
    void canal.publicar(params);
  });

  const bajaCanal = canal.suscribir((anuncio: AnuncioParamsOrbe) => {
    desdeElCanal = true;
    try {
      emitQuantumOrbParams(anuncio.params);
    } finally {
      desdeElCanal = false;
    }
  });

  return {
    cerrar() {
      bajaBus();
      bajaCanal();
    },
  };
}

/**
 * Abre el tema `orb_params` con el cliente de tiempo real dado y lo une al bus.
 * Con `cliente` nulo (sin red, sin sesión, sin Supabase) no abre nada y el
 * desenganche es un no-op: el bus local sigue funcionando igual.
 */
export function montarCanalOrbeParams(cliente: ClienteRealtimeMin | null): () => void {
  let canal: CanalOrbeParams | null = null;
  try {
    canal = crearCanalOrbeParams({ cliente });
  } catch {
    return () => undefined;
  }
  const puente = conectarPuenteOrbeParams(canal);
  return () => {
    puente.cerrar();
    try {
      canal?.cerrar();
    } catch {
      /* cerrar nunca lanza */
    }
  };
}