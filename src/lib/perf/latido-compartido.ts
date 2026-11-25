"use client";

/**
 * DIR1125L · Un solo reloj por periodo para toda la página.
 *
 * Antes, cada copia de un gancho con «latido» (`useDetectedSignals`, `useAhora` del mapa, el sondeo del Bluetooth directo)
 * montaba su propio `setInterval`. En /senales hay 4-5 copias a la vez (mapa, contenido del mapa, radar, panel…): cada una
 * latía en su propia tarea, y cada latido era un render de React y un cuadro 3D aparte. Medido en la Maggabox (25-11): un
 * parón de ~0,9 s cada 15 s.
 *
 * Aquí hay UN `setInterval` por periodo, compartido: todos los oyentes se llaman en la misma tarea, así React los pinta en
 * una sola pasada. Con la pestaña oculta el reloj se para; al volver a verse, late una vez enseguida y sigue (como hacía
 * `useAhora`). Solo tiempo de ejecución: no cambia ningún dato ni ningún ajuste.
 */

import { useEffect, useState } from "react";

type Oyente = (ahora: number) => void;
interface Reloj {
  oyentes: Set<Oyente>;
  t: ReturnType<typeof setInterval> | null;
}

const relojes = new Map<number, Reloj>();
let mirandoVisibilidad = false;

function oculta(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function latir(r: Reloj): void {
  const ahora = Date.now();
  for (const o of Array.from(r.oyentes)) {
    try {
      o(ahora);
    } catch {
      /* un oyente roto no para a los demás */
    }
  }
}

function arrancar(ms: number, r: Reloj): void {
  if (r.t !== null || r.oyentes.size === 0 || oculta()) return;
  r.t = setInterval(() => latir(r), ms);
}

function parar(r: Reloj): void {
  if (r.t !== null) {
    clearInterval(r.t);
    r.t = null;
  }
}

function alCambiarVisibilidad(): void {
  for (const [ms, r] of relojes) {
    if (oculta()) parar(r);
    else if (r.oyentes.size > 0 && r.t === null) {
      latir(r);
      arrancar(ms, r);
    }
  }
}

/** Se apunta al reloj compartido de `ms`. Devuelve la función para borrarse (el último en irse apaga el reloj). */
export function suscribirLatido(ms: number, oyente: Oyente): () => void {
  let r = relojes.get(ms);
  if (!r) {
    r = { oyentes: new Set(), t: null };
    relojes.set(ms, r);
  }
  r.oyentes.add(oyente);
  if (!mirandoVisibilidad && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    mirandoVisibilidad = true;
  }
  arrancar(ms, r);
  return () => {
    const x = relojes.get(ms);
    if (!x) return;
    x.oyentes.delete(oyente);
    if (x.oyentes.size === 0) {
      parar(x);
      relojes.delete(ms);
    }
  };
}

/** La hora del último latido del reloj compartido de `ms` (al montar, la de ahora). */
export function useLatido(ms: number): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => suscribirLatido(ms, setAhora), [ms]);
  return ahora;
}

/** Cuántos relojes hay en marcha (para las pruebas y el censo). */
export function relojesEnMarcha(): number {
  let n = 0;
  for (const r of relojes.values()) if (r.t !== null) n++;
  return n;
}
