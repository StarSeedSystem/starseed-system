"use client";

/**
 * La simulación del mundo en la interfaz (Ola 1025U · U1): avanza con un temporizador que se detiene de
 * verdad con la pausa y con la pestaña oculta (sin intervalo no hay despertares), parte de lo GUARDADO de
 * cada escenario y lo vuelve a guardar. Antes `guardarMundo`/`cargarMundo` existían y nadie los llamaba.
 *
 * `entradas === null` quiere decir «todavía no sé quién vive aquí» (se están leyendo las fuentes de la
 * cuenta): hasta entonces no se toca el mundo guardado, porque reconciliarlo con una lista vacía borraría a todos.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  avanzar,
  cargarMundo,
  guardarMundo,
  mundoInicial,
  pasosParaTick,
  reconciliarHabitantes,
  type EntradaHabitante,
  type EstadoMundo,
  type ZonaSim,
} from "@/lib/avatares/mundo/simulacion";

/** Cada cuántos ticks se guarda el mundo en este aparato. */
export const TICKS_ENTRE_GUARDADOS = 5;
const INTERVALO_BASE_MS = 1100;

/** Milisegundos entre ticks para una velocidad (1×, 2×, 4×). */
export function msPorTick(velocidad: number): number {
  const v = Number.isFinite(velocidad) && velocidad > 0 ? velocidad : 1;
  return Math.max(120, Math.floor(INTERVALO_BASE_MS / v));
}

interface Sim {
  escenarioId: string;
  clave: string;
  estado: EstadoMundo;
}

export interface OpcionesSimulacion {
  escenarioId: string;
  /** Quién vive en este escenario ahora. `null` = aún se está leyendo. */
  entradas: readonly EntradaHabitante[] | null;
  /** Mundo con el que arrancar la primera vez (tiene prioridad sobre lo guardado). */
  estadoInicial?: EstadoMundo;
  pausado: boolean;
  oculta: boolean;
  velocidad: number;
  /** Zonas y radio del escenario, leídos en cada tick sin reiniciar el temporizador. */
  zonas: MutableRefObject<readonly ZonaSim[]>;
  radio: MutableRefObject<number>;
  /** `false` si las fuentes fallaron y la lista puede estar incompleta: no se pisa lo guardado. */
  puedeGuardar: boolean;
}

export interface ResultadoSimulacion {
  /** `null` mientras no se sabe quién vive aquí. */
  estado: EstadoMundo | null;
  /** `false` si el último guardado en este aparato falló. */
  guardado: boolean;
}

const claveDe = (escenarioId: string, entradas: readonly EntradaHabitante[]): string =>
  `${escenarioId}|${entradas.map((e) => `${e.agenteId ?? e.id}:${e.nombre}`).join("|")}`;

export function useSimulacionMundo(o: OpcionesSimulacion): ResultadoSimulacion {
  const { escenarioId, entradas, estadoInicial, pausado, oculta, velocidad, zonas, radio, puedeGuardar } = o;
  const [sim, setSim] = useState<Sim | null>(null);
  const [guardado, setGuardado] = useState(true);

  // Estado derivado de las entradas: al cambiar de escenario se carga el suyo; al cambiar la gente se reconcilia.
  let actual = sim;
  if (entradas) {
    const clave = claveDe(escenarioId, entradas);
    if (!sim || sim.clave !== clave) {
      let base: EstadoMundo | null;
      if (sim && sim.escenarioId === escenarioId) base = sim.estado;
      else if (!sim && estadoInicial) base = estadoInicial;
      else base = cargarMundo(escenarioId, { zonas: zonas.current, radioMundo: radio.current });
      actual = { escenarioId, clave, estado: base ? reconciliarHabitantes(base, entradas) : mundoInicial(entradas) };
      setSim(actual);
    }
  }

  // El temporizador solo existe mientras hay mundo, no hay pausa y la pestaña se ve.
  const hayMundo = actual !== null;
  useEffect(() => {
    if (!hayMundo || pausado || oculta) return;
    const temporizador = setInterval(() => {
      const r = pasosParaTick({ pausado: false, pestañaOculta: typeof document !== "undefined" && document.hidden, pasosPendientes: 0 });
      if (r.pasos <= 0) return;
      setSim((previo) => (previo ? { ...previo, estado: avanzar(previo.estado, r.pasos, { zonas: zonas.current, radioMundo: radio.current }) } : previo));
    }, msPorTick(velocidad));
    return () => clearInterval(temporizador);
  }, [hayMundo, pausado, oculta, velocidad, zonas, radio]);

  // Guardado: el primer estado de cada escenario y luego cada `TICKS_ENTRE_GUARDADOS` ticks.
  // `guardar` es estable y lee lo último por referencia: si dependiera de `puedeGuardar`, al cambiar ese permiso la
  // limpieza del efecto de abajo llamaría al `guardar` VIEJO (con el permiso viejo) y pisaría lo guardado.
  const ultimo = useRef<Sim | null>(null);
  const permiso = useRef(puedeGuardar);
  ultimo.current = actual;
  permiso.current = puedeGuardar;
  const guardar = useCallback(() => {
    const s = ultimo.current;
    if (!permiso.current || !s || s.estado.habitantes.length === 0) return;
    setGuardado(guardarMundo(s.estado, s.escenarioId));
  }, []);

  const tick = actual?.estado.tick ?? -1;
  const escenarioActual = actual?.escenarioId ?? "";
  const clavePresente = actual?.clave ?? "";
  useEffect(() => {
    if (tick < 0) return;
    if (tick === 0 || tick % TICKS_ENTRE_GUARDADOS === 0) guardar();
  }, [tick, escenarioActual, clavePresente, guardar]);

  // Y al esconder la pestaña, al cerrarla y al desmontar: lo último no se pierde.
  useEffect(() => {
    const alOcultar = () => {
      if (document.hidden) guardar();
    };
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", guardar);
    return () => {
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("pagehide", guardar);
      guardar();
    };
  }, [guardar]);

  return { estado: actual?.estado ?? null, guardado };
}
