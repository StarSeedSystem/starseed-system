"use client";
/**
 * orbe-params-publisher — publica el vector de la orbe en `orb_params` y lo
 * devuelve al bus local de otras neuronas (tiempo real, sin sondeo).
 * ----------------------------------------------------------------------------
 * El bus (`quantum-orb-bus.ts`) ya recibe el vector por cláusula
 * (`vector-por-clausula.ts`) o del motor 1.58b. Este montaje, uno por pestaña,
 * lo lleva al canal `orb_params` (`canal-orbe-params.ts`) para que
 * Nexus/Exocortex/agentes reaccionen al estado interno del modelo. Lo remoto
 * vuelve al bus local sin re-publicarse, así que no hay bucles.
 */
import { useEffect } from "react";
import {
  crearCanalOrbeParams,
  type CanalBroadcastMin,
  type ClienteRealtimeMin,
} from "@/lib/aurora/canal-orbe-params";
import { emitQuantumOrbParams, onQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";

/** Forma mínima del cliente de Supabase que usa el canal (sin acoplarse a su tipo). */
interface CanalSupabaseMin {
  on(tipo: "broadcast", filtro: { event: string }, cb: (msg: { payload?: unknown }) => void): unknown;
  subscribe(cb: (estado: string, err?: unknown) => void): unknown;
  send(msg: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
}
interface ClienteSupabaseMin {
  channel(nombre: string, opciones: { config: { broadcast: { self: boolean } } }): CanalSupabaseMin;
  removeChannel(canal: CanalSupabaseMin): unknown;
}

/** Monta el canal sobre un cliente inyectado; devuelve el desmontaje. */
export function montarPublicadorOrbeParams(deps: {
  cliente: ClienteRealtimeMin | null;
  ahora?: () => number;
}): () => void {
  const canal = crearCanalOrbeParams({ cliente: deps.cliente, ahora: deps.ahora });
  let aplicandoRemoto = false;
  const desenganchar = onQuantumOrbParams((params) => {
    if (aplicandoRemoto) return;
    void canal.publicar(params);
  });
  const desuscribir = canal.suscribir(({ params }) => {
    aplicandoRemoto = true;
    try {
      emitQuantumOrbParams(params);
    } finally {
      aplicandoRemoto = false;
    }
  });
  return () => {
    desenganchar();
    desuscribir();
    canal.cerrar();
  };
}

/** Adapta el cliente real al contrato mínimo del canal. */
function adaptarCliente(supabase: ClienteSupabaseMin): ClienteRealtimeMin {
  const reales = new Map<CanalBroadcastMin, CanalSupabaseMin>();
  return {
    channel(nombre, opciones) {
      const real = supabase.channel(nombre, opciones);
      const adaptado: CanalBroadcastMin = {
        on(_tipo, filtro, cb) {
          real.on("broadcast", { event: filtro.event }, (msg) => cb({ payload: msg?.payload }));
          return adaptado;
        },
        subscribe(cb) {
          real.subscribe(cb);
          return adaptado;
        },
        send(msg) {
          return real.send(msg);
        },
      };
      reales.set(adaptado, real);
      return adaptado;
    },
    removeChannel(adaptado) {
      const real = reales.get(adaptado);
      reales.delete(adaptado);
      return real ? supabase.removeChannel(real) : undefined;
    },
  };
}

/** Montaje global: una vez por pestaña, tras el primer pintado. */
export function OrbeParamsPublisher(): null {
  useEffect(() => {
    let vivo = true;
    let desmontar: (() => void) | null = null;
    const t = setTimeout(() => {
      void import("@/utils/supabase/client")
        .then(({ createClient }) => {
          if (!vivo) return;
          const cliente = adaptarCliente(createClient() as unknown as ClienteSupabaseMin);
          desmontar = montarPublicadorOrbeParams({ cliente });
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      vivo = false;
      clearTimeout(t);
      desmontar?.();
    };
  }, []);
  return null;
}
