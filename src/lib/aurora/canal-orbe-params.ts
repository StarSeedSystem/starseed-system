"use client";
/**
 * canal-orbe-params — publica el vector de la orbe (1.58b) por Supabase Realtime.
 * ----------------------------------------------------------------------------
 * Tema público `orb_params`, difusión y sin sondeo: cualquier neurona o
 * Exocortex se suscribe y reacciona en color, pulso o forma. El cliente se
 * inyecta para probarlo con uno falso; el contrato puro vive en
 * `orbe-params-telemetria.ts`.
 */
import { onQuantumOrbParams } from "./quantum-orb-bus";
import type { QuantumOrbParams } from "./quantum-orb-theme";
import {
  EVENTO_ORBE_PARAMS,
  TEMA_ORBE_PARAMS,
  leerAnuncioOrbe,
  leerVectorOrbe,
  motivoDe,
  type AnuncioParamsOrbe,
  type CanalBroadcastMin,
  type CanalOrbeParams,
  type DepsCanalOrbeParams,
  type EstadoCanalOrbe,
} from "./orbe-params-telemetria";

export * from "./orbe-params-telemetria";

export function crearCanalOrbeParams(deps: DepsCanalOrbeParams): CanalOrbeParams {
  const ahora = deps.ahora ?? Date.now;
  let estado: EstadoCanalOrbe = { union: "sin-intentar", motivo: null };
  const oyentes = new Set<(anuncio: AnuncioParamsOrbe) => void>();
  let canal: CanalBroadcastMin | null = null;
  let cerrado = false;

  if (!deps.cliente) estado = { union: "rechazado", motivo: "no hay conexión de tiempo real" };
  else {
    try {
      estado = { union: "uniendo", motivo: null };
      const c = deps.cliente.channel(TEMA_ORBE_PARAMS, { config: { broadcast: { self: false } } });
      canal = c;
      c.on("broadcast", { event: EVENTO_ORBE_PARAMS }, (msg) => {
        if (canal !== c || cerrado) return;
        const anuncio = leerAnuncioOrbe(msg?.payload);
        if (!anuncio) return;
        for (const cb of Array.from(oyentes)) {
          try {
            cb(anuncio);
          } catch {
            /* un suscriptor roto no impide que reaccionen los demás */
          }
        }
      });
      c.subscribe((s, err) => {
        if (canal !== c || cerrado) return;
        if (s === "SUBSCRIBED") estado = { union: "unido", motivo: null };
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          estado = { union: "rechazado", motivo: motivoDe(s, err) };
        }
      });
    } catch (e) {
      canal = null;
      estado = { union: "rechazado", motivo: motivoDe("CHANNEL_ERROR", e) };
    }
  }

  return {
    estado: () => estado,
    suscribir: (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    async publicar(params: Partial<QuantumOrbParams>) {
      const c = canal;
      if (!c || cerrado || estado.union !== "unido") return false;
      const vector = leerVectorOrbe(params);
      if (!vector) return false;
      try {
        await c.send({ type: "broadcast", event: EVENTO_ORBE_PARAMS, payload: { params: vector, at: ahora() } });
        return true;
      } catch {
        return false;
      }
    },
    cerrar() {
      cerrado = true;
      const c = canal;
      canal = null;
      oyentes.clear();
      if (!c) return;
      try {
        void Promise.resolve(deps.cliente?.removeChannel(c)).catch(() => undefined);
      } catch {
        /* cerrar nunca lanza */
      }
    },
  };
}

/** Cada vector del bus local se publica en `orb_params`; devuelve el desenganche. */
export function puenteBusACanal(canal: Pick<CanalOrbeParams, "publicar">): () => void {
  return onQuantumOrbParams((params) => {
    void canal.publicar(params);
  });
}
