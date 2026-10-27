"use client";

/**
 * Hook de la tarjeta «Protomolécula» de la cortina Horizon: el interruptor y los ajustes de la orbe 4D.
 *
 * NO hay almacenamiento propio. Todo pasa por la API de la orbe, así el cambio es instantáneo y viaja con la
 * cuenta a todas las neuronas igual que hoy (las dos claves están en `SYNCED_KEYS`):
 *   · encendida → `guardarActivada` + `PROTO_ORB_FAB_EVENT` (la orbe se enciende o se apaga al momento);
 *   · estilo    → `guardarEstilo` + aviso `estilo` por `PROTO_ORB_ESTADO_EVENT`;
 *   · forma     → aviso `forma` (la orbe la guarda solo en la sesión: no es un ajuste de cuenta);
 *   · posición  → se borra su clave local y se avisa a la orbe con un `storage` (la posición es de cada
 *                 aparato y no se sincroniza).
 * Y escucha lo que cambia desde fuera: la orbe arrastrada a su zona de apagado, Astraura, otra pestaña
 * (`storage`) y la sincronía de cuenta (`starseed:sync:apply`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_FAB_KEY,
  PROTO_ORB_POS_KEY,
  fijarOrbeActivada,
  leerActivada,
  type AlmacenLocal,
} from "@/lib/protomolecula/orbe-bus";
import {
  PROTO_ORB_ESTADO_EVENT,
  PROTO_ORB_ESTILO_KEY,
  avisarOrbe,
  guardarEstilo,
  leerDetalle,
  leerEstilo,
} from "@/lib/protomolecula/orbe4d/eventos";
import type { Estilo, IdForma } from "@/lib/protomolecula/orbe4d/coreografia";

const SYNC_APPLY_EVENT = "starseed:sync:apply";
/** Margen para que la orbe termine de encenderse antes de repetirle estilo y forma. */
const ESPERA_ENCENDIDO_MS = 120;

const SIN_ALMACEN: AlmacenLocal = { getItem: () => null, setItem: () => undefined };

function almacen(): AlmacenLocal {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : SIN_ALMACEN;
  } catch {
    return SIN_ALMACEN;
  }
}

/**
 * La forma fijada la guarda la orbe en su estado de React, sin clave en la cuenta. Aquí se recuerda en el
 * módulo para que la tarjeta no vuelva a decir «Automática» cada vez que se abre la cortina; se mantiene al
 * día con cualquier aviso `forma` (Astraura, el panel de la orbe…) desde la primera vez que se monta.
 */
let formaFijadaMemoria: IdForma | null = null;
let vigilandoForma = false;

function vigilarForma() {
  if (vigilandoForma || typeof window === "undefined") return;
  vigilandoForma = true;
  window.addEventListener(PROTO_ORB_ESTADO_EVENT, (e) => {
    const d = leerDetalle((e as CustomEvent).detail);
    if (d && d.estado === "forma") formaFijadaMemoria = d.forma;
  });
}

export interface EstadoOrbe {
  activada: boolean;
  estilo: Estilo;
  /** `null` = automática (la orbe recorre sus formas según lo que pasa). */
  forma: IdForma | null;
  alternar: (encendida: boolean) => void;
  elegirEstilo: (estilo: Estilo) => void;
  elegirForma: (forma: IdForma | null) => void;
  devolverASuSitio: () => void;
}

export function useOrbeProtomolecula(): EstadoOrbe {
  const [activada, setActivada] = useState<boolean>(() => leerActivada(almacen()));
  const [estilo, setEstilo] = useState<Estilo>(() => leerEstilo(almacen()));
  const [forma, setForma] = useState<IdForma | null>(() => formaFijadaMemoria);
  const estiloRef = useRef(estilo);
  const formaRef = useRef(forma);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  estiloRef.current = estilo;
  formaRef.current = forma;

  useEffect(() => {
    vigilarForma();
    const releer = () => {
      setActivada(leerActivada(almacen()));
      setEstilo(leerEstilo(almacen()));
    };
    releer();
    setForma(formaFijadaMemoria);

    // La orbe (o quien la encienda desde fuera) avisa con `{ detail: { activada } }`; también vale un booleano.
    const deFab = (e: Event) => {
      const d = (e as CustomEvent<{ activada?: unknown } | boolean | undefined>).detail;
      if (typeof d === "boolean") setActivada(d);
      else if (d && typeof d === "object" && typeof d.activada === "boolean") setActivada(d.activada);
      else setActivada(leerActivada(almacen()));
    };
    const deEstado = (e: Event) => {
      const d = leerDetalle((e as CustomEvent).detail);
      if (!d) return;
      if (d.estado === "estilo") setEstilo(d.estilo);
      if (d.estado === "forma") setForma(d.forma);
    };
    const deAlmacen = (e: StorageEvent) => {
      if (e.key === PROTO_ORB_FAB_KEY || e.key === null) setActivada(leerActivada(almacen()));
      if (e.key === PROTO_ORB_ESTILO_KEY || e.key === null) setEstilo(leerEstilo(almacen()));
    };

    window.addEventListener(PROTO_ORB_FAB_EVENT, deFab);
    window.addEventListener(PROTO_ORB_ESTADO_EVENT, deEstado);
    window.addEventListener(SYNC_APPLY_EVENT, releer);
    window.addEventListener("storage", deAlmacen);
    return () => {
      window.removeEventListener(PROTO_ORB_FAB_EVENT, deFab);
      window.removeEventListener(PROTO_ORB_ESTADO_EVENT, deEstado);
      window.removeEventListener(SYNC_APPLY_EVENT, releer);
      window.removeEventListener("storage", deAlmacen);
      if (espera.current) clearTimeout(espera.current);
    };
  }, []);

  // Puerta común (PMO1020A): guardar, emitir y empujar a la cuenta pasan por `fijarOrbeActivada`,
  // así el botón del lienzo hace exactamente lo mismo que Astraura desde cualquier medio.
  const alternar = useCallback((encendida: boolean) => {
    fijarOrbeActivada(encendida, { almacen: almacen() });
    setActivada(encendida);
    if (!encendida) return;
    // Si se eligió estilo o forma con la orbe apagada, se le repite al encenderla para que su panel coincida.
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      avisarOrbe({ estado: "estilo", estilo: estiloRef.current });
      if (formaRef.current) avisarOrbe({ estado: "forma", forma: formaRef.current });
    }, ESPERA_ENCENDIDO_MS);
  }, []);

  const elegirEstilo = useCallback((nuevo: Estilo) => {
    guardarEstilo(almacen(), nuevo);
    setEstilo(nuevo);
    avisarOrbe({ estado: "estilo", estilo: nuevo });
  }, []);

  const elegirForma = useCallback((nueva: IdForma | null) => {
    formaFijadaMemoria = nueva;
    setForma(nueva);
    avisarOrbe({ estado: "forma", forma: nueva });
  }, []);

  const devolverASuSitio = useCallback(() => {
    try {
      window.localStorage.removeItem(PROTO_ORB_POS_KEY);
      // `storage` no salta en la propia pestaña: se avisa a la orbe como hace con las otras (relee la posición).
      window.dispatchEvent(new StorageEvent("storage", { key: PROTO_ORB_POS_KEY, newValue: null }));
    } catch {
      /* defensivo */
    }
  }, []);

  return { activada, estilo, forma, alternar, elegirEstilo, elegirForma, devolverASuSitio };
}
