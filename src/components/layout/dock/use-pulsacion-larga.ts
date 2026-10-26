"use client";

/**
 * usePulsacionLarga — el gesto «mantener presionado» como manejadores de puntero (Ola 1025U · V1a).
 * ─────────────────────────────────────────────────────────────────────────────
 * Envuelve el detector puro de `@/lib/dock/pulsacion-larga` (450 ms, 8 px) para
 * React: ratón, dedo y lápiz por el MISMO camino (Pointer Events). El hook no
 * guarda estado de render (todo vive en refs): quien lo usa decide qué pintar con
 * los avisos `alActivar`, `alEmpezarArrastre`, `alMover` y `alTerminar`.
 *
 * Una sola pulsación a la vez: un segundo dedo se ignora mientras hay un gesto en
 * curso. Cada manejador devuelve la fase en la que queda el gesto, para que el
 * dock sepa si debe apartarse del resto de gestos (desplazar el carril, bajar el dock).
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type React from "react";
import {
  crearDetectorPulsacion,
  type DetectorPulsacion,
  type FaseGesto,
  type Punto,
  type ResultadoGesto,
  type TipoPuntero,
} from "@/lib/dock/pulsacion-larga";

export interface OpcionesPulsacionLarga<T> {
  habilitado?: boolean;
  retardoMs?: number;
  tolerancia?: number;
  /** Qué se está pulsando (null = nada que vigilar). */
  claveDe: (e: React.PointerEvent<HTMLElement>) => T | null;
  alActivar?: (clave: T, punto: Punto, tipo: TipoPuntero) => void;
  alEmpezarArrastre?: (clave: T, punto: Punto, tipo: TipoPuntero) => void;
  /** Cada movimiento mientras se arrastra (`delta` respecto al punto de partida). */
  alMover?: (clave: T, punto: Punto, delta: Punto) => void;
  alTerminar?: (clave: T, resultado: ResultadoGesto, punto: Punto) => void;
}

export interface PulsacionLarga {
  manejadores: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => FaseGesto;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => FaseGesto;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => FaseGesto;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => FaseGesto;
  };
  /** Fase actual (síncrona: se puede leer dentro de otros manejadores). */
  fase: () => FaseGesto;
  /** Anula el gesto en curso sin avisar de un resultado (Escape, dock cerrado…). */
  cancelar: () => void;
}

function tipoDe(e: React.PointerEvent<HTMLElement>): TipoPuntero {
  return e.pointerType === "touch" ? "touch" : e.pointerType === "pen" ? "pen" : "mouse";
}

export function usePulsacionLarga<T>(op: OpcionesPulsacionLarga<T>): PulsacionLarga {
  // Las opciones cambian en cada render; los manejadores son estables y leen la última.
  const opRef = useRef(op);
  opRef.current = op;
  const idRef = useRef<number | null>(null);
  const detectorRef = useRef<DetectorPulsacion<T> | null>(null);

  if (detectorRef.current === null) {
    detectorRef.current = crearDetectorPulsacion<T>({
      retardoMs: op.retardoMs,
      tolerancia: op.tolerancia,
      alActivar: (clave, punto, tipo) => opRef.current.alActivar?.(clave, punto, tipo),
      alEmpezarArrastre: (clave, punto, tipo) => opRef.current.alEmpezarArrastre?.(clave, punto, tipo),
    });
  }
  const detector = detectorRef.current;

  const soltarId = () => {
    idRef.current = null;
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>): FaseGesto => {
    const o = opRef.current;
    if (o.habilitado === false) return detector.fase();
    if (tipoDe(e) === "mouse" && e.button !== 0) return detector.fase();
    if (e.isPrimary === false) return detector.fase();
    if (detector.fase() !== "inactivo") return detector.fase(); // un solo gesto a la vez
    const clave = o.claveDe(e);
    if (clave === null || clave === undefined) return detector.fase();
    idRef.current = e.pointerId;
    detector.comenzar(clave, { x: e.clientX, y: e.clientY }, tipoDe(e));
    return detector.fase();
  }, [detector]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>): FaseGesto => {
    if (idRef.current === null || e.pointerId !== idRef.current) return detector.fase();
    const punto = { x: e.clientX, y: e.clientY };
    const r = detector.mover(punto);
    if (r.cancelada) soltarId();
    else if (r.fase === "arrastrando") {
      const clave = detector.clave();
      if (clave !== null) opRef.current.alMover?.(clave, punto, r.delta);
    }
    return r.fase;
  }, [detector]);

  const terminar = useCallback((e: React.PointerEvent<HTMLElement>, cancelado: boolean): FaseGesto => {
    if (idRef.current === null || e.pointerId !== idRef.current) return detector.fase();
    const clave = detector.clave();
    const punto = { x: e.clientX, y: e.clientY };
    const resultado = cancelado ? (detector.cancelar(), "cancelado" as const) : detector.terminar();
    soltarId();
    if (clave !== null) opRef.current.alTerminar?.(clave, resultado, punto);
    return detector.fase();
  }, [detector]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => terminar(e, false), [terminar]);
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => terminar(e, true), [terminar]);

  const cancelar = useCallback(() => {
    detector.cancelar();
    soltarId();
  }, [detector]);

  // Si el componente se desmonta a mitad de un gesto, el temporizador no queda vivo.
  useEffect(() => () => detector.cancelar(), [detector]);

  return useMemo(
    () => ({ manejadores: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, fase: () => detector.fase(), cancelar }),
    [cancelar, detector, onPointerCancel, onPointerDown, onPointerMove, onPointerUp],
  );
}
