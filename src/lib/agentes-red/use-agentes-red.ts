"use client";
/**
 * Ganchos de React del perfil de agente y del bloqueo de bots (Ola 1025U · U3). Los dos almacenes viven en
 * `localStorage` y viajan con la cuenta; aquí solo se suscriben a sus eventos (el del propio medio, el de otra
 * pestaña y el que dispara el motor de sync cuando llega un cambio de otro aparato).
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  EVENTO_BLOQUEO_BOTS, REGLAS_VACIAS, filtrarArbolPorBloqueo, filtrarPorBloqueo, leerReglas,
  type ContextoBot, type ReglasBloqueoBots,
} from "./bloqueo-bots";
import { EVENTO_PERFIL_AGENTE, leerPerfilAgente, type PerfilAgenteRedDatos } from "./perfil-agente";

function suscribirEventos(evento: string, avisar: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(evento, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(evento, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** Las reglas de bloqueo de bots de esta persona, siempre al día. */
export function useReglasBloqueoBots(): ReglasBloqueoBots {
  return useSyncExternalStore(
    useCallback((avisar: () => void) => suscribirEventos(EVENTO_BLOQUEO_BOTS, avisar), []),
    leerReglas,
    () => REGLAS_VACIAS,
  );
}

/** Quita de una lista lo que publicó un bot que esta persona tiene bloqueado o filtrado. Se actualiza al instante. */
export function useFiltradoBots<T>(items: readonly T[], ctx?: ContextoBot): T[] {
  const reglas = useReglasBloqueoBots();
  const tipo = ctx?.entidad?.tipo;
  const id = ctx?.entidad?.id;
  const postId = ctx?.postId;
  // `ctx` se reconstruye en cada render; sus partes (primitivas) son la dependencia real.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => filtrarPorBloqueo(items, reglas, ctx), [items, reglas, tipo, id, postId]);
}

/** Lo mismo para un árbol de comentarios (`children`). */
export function useFiltradoArbolBots<N extends { children: N[] }>(nodos: readonly N[], ctx?: ContextoBot): N[] {
  const reglas = useReglasBloqueoBots();
  const tipo = ctx?.entidad?.tipo;
  const id = ctx?.entidad?.id;
  const postId = ctx?.postId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => filtrarArbolPorBloqueo(nodos, reglas, ctx), [nodos, reglas, tipo, id, postId]);
}

/** El perfil en la red de un agente, al día (se relee si cambia en este medio, en otra pestaña o llega de la cuenta). */
export function usePerfilAgenteRed(agenteId: string): PerfilAgenteRedDatos {
  const [perfil, setPerfil] = useState<PerfilAgenteRedDatos>(() => leerPerfilAgente(agenteId));
  useEffect(() => {
    setPerfil(leerPerfilAgente(agenteId));
    return suscribirEventos(EVENTO_PERFIL_AGENTE, () => setPerfil(leerPerfilAgente(agenteId)));
  }, [agenteId]);
  return perfil;
}
