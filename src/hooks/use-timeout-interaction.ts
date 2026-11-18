"use client";

/**
 * IMG-agentes-reimaginada-profunda-corregir-te-d2 (parte 2) · temporizador de
 * la guía de Aurora atado a la interacción de la persona.
 *
 * Antes la guía se abría sola al vencer un reloj fijo y saltaba encima de quien
 * estaba navegando. Este hook escucha las señales de uso (clic, tecla, rueda,
 * toque, ratón y desplazamiento), guarda la última y REARMA el respiro con cada
 * una: la apertura automática solo llega tras un silencio real. El cálculo del
 * respiro vive en una función pura (`planificarRespiro`) y la decisión final se
 * delega en `puedeAbrirGuiaSola` (parte 1), para no duplicar reglas.
 *
 * El cierre explícito es cosa de la interfaz (parte 3): aquí solo se ofrece
 * `detener` para cancelar el respiro pendiente sin simular una interacción.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  EVENTOS_INTERACCION,
  RESPIRO_APERTURA_MS,
  puedeAbrirGuiaSola,
} from "@/lib/onboarding/guia-temporizador";

/** Respiro por defecto: el mismo que ya usaba la guía (900 ms). */
export const RESPIRO_POR_DEFECTO_MS = RESPIRO_APERTURA_MS;

/** Plan del próximo chequeo del respiro, en milisegundos desde epoch. */
export interface PlanRespiro {
  /** Última interacción válida; 0 cuando aún no hay señal. */
  ultimaInteraccionMs: number;
  /** Momento en que toca revisar si la persona sigue en silencio. */
  revisarEnMs: number;
  /** Espera desde `ahoraMs` hasta `revisarEnMs`, nunca negativa. */
  esperaMs: number;
}

/** Opciones del hook. */
export interface OpcionesTemporizadorInteraccion {
  /** Si es false, no se escucha ni se programa nada (guía ya abierta, etc.). */
  activo?: boolean;
  /** Respiro sin interacción que se pide antes de abrir (ms). */
  respiroMs?: number;
  /** Se llama cuando el respiro se cumple de verdad. */
  alCumplirRespiro: () => void;
  /** Eventos que cuentan como interacción; por defecto, el catálogo de la guía. */
  eventos?: readonly string[];
}

/** Control que el hook devuelve al componente. */
export interface ControlTemporizadorInteraccion {
  /** Última interacción vista (epoch ms; 0 si aún ninguna). */
  ultimaInteraccionRef: RefObject<number>;
  /** Marca una interacción manual y rearma el respiro. */
  reiniciar: () => void;
  /** Cancela el respiro pendiente sin marcar interacción. */
  detener: () => void;
}

/**
 * Calcula cuándo revisar el respiro. Sin señal de interacción (0, null, NaN o
 * negativa) la revisión es inmediata — igual que `puedeAbrirGuiaSola` — y un
 * respiro inválido tampoco espera: la puerta de la parte 1 negará la apertura.
 */
export function planificarRespiro(
  ultimaInteraccionMs: number | null | undefined,
  ahoraMs: number,
  respiroMs: number = RESPIRO_POR_DEFECTO_MS,
): PlanRespiro {
  const ahora = Number.isFinite(ahoraMs) ? ahoraMs : 0;
  const respiro =
    Number.isFinite(respiroMs) && respiroMs >= 0 ? respiroMs : 0;
  const ultima =
    typeof ultimaInteraccionMs === "number" &&
    Number.isFinite(ultimaInteraccionMs) &&
    ultimaInteraccionMs > 0
      ? ultimaInteraccionMs
      : 0;
  if (ultima === 0) {
    return { ultimaInteraccionMs: 0, revisarEnMs: ahora, esperaMs: 0 };
  }
  const revisarEnMs = ultima + respiro;
  return {
    ultimaInteraccionMs: ultima,
    revisarEnMs,
    esperaMs: Math.max(0, revisarEnMs - ahora),
  };
}

export function useTimeoutInteraction(
  opciones: OpcionesTemporizadorInteraccion,
): ControlTemporizadorInteraccion {
  const activo = opciones.activo ?? true;
  const respiroMs = opciones.respiroMs ?? RESPIRO_POR_DEFECTO_MS;
  const eventos = opciones.eventos ?? EVENTOS_INTERACCION;
  const ultimaInteraccionRef = useRef(0);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Los callbacks y el respiro viven en refs: cambiar el callback no debe
  // re-suscribir todos los oyentes ni reiniciar el respiro en cada render.
  const alCumplirRef = useRef(opciones.alCumplirRespiro);
  const respiroRef = useRef(respiroMs);
  const activoRef = useRef(activo);
  const eventosRef = useRef(eventos);
  alCumplirRef.current = opciones.alCumplirRespiro;
  respiroRef.current = respiroMs;
  activoRef.current = activo;
  eventosRef.current = eventos;

  const detener = useCallback(() => {
    if (temporizadorRef.current !== null) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
  }, []);

  const programar = useCallback(() => {
    detener();
    if (!activoRef.current) return;
    const plan = planificarRespiro(
      ultimaInteraccionRef.current,
      Date.now(),
      respiroRef.current,
    );
    temporizadorRef.current = setTimeout(() => {
      temporizadorRef.current = null;
      if (
        puedeAbrirGuiaSola(
          ultimaInteraccionRef.current,
          Date.now(),
          respiroRef.current,
        )
      ) {
        alCumplirRef.current();
      }
    }, plan.esperaMs);
  }, [detener]);

  const reiniciar = useCallback(() => {
    ultimaInteraccionRef.current = Date.now();
    programar();
  }, [programar]);

  useEffect(() => {
    if (typeof window === "undefined" || !activo) return;
    // El primer respiro cuenta desde el montaje, no desde epoch.
    ultimaInteraccionRef.current = Date.now();
    programar();
    // Capture: también cuenta el desplazamiento dentro de contenedores.
    const marcar = () => reiniciar();
    const tipos = eventosRef.current;
    for (const tipo of tipos) {
      window.addEventListener(tipo, marcar, { capture: true, passive: true });
    }
    return () => {
      for (const tipo of tipos) {
        window.removeEventListener(tipo, marcar, { capture: true });
      }
      detener();
    };
  }, [activo, programar, reiniciar, detener]);

  return { ultimaInteraccionRef, reiniciar, detener };
}
