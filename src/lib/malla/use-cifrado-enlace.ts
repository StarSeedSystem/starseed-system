"use client";

/**
 * useCifradoNeurona — ¿el enlace directo con esa neurona va cifrado de punta a punta? (CIF1108A · 2026-11-08)
 * Lee `cifradoDe()` de la red local nativa (TCP 47071, también el Wi-Fi directo) y del Bluetooth directo:
 * «cifrado», «pendiente» (acordando la sesión) o «sin-cifrar» (el otro lado es una app anterior). Null si no
 * hay enlace directo ligado con ella (por internet, o fuera de la app nativa). Solo LEE; no arranca nada.
 * Contrato: architecture/datos-por-la-malla.md §6.7.
 */

import { useEffect, useState } from "react";
import { bluetoothDirectoActivo } from "./bluetooth-directo-motor";
import { redLocalNativaActiva } from "./red-local-nativa-motor";
import type { EtiquetaCifrado } from "./sesion-cifrada";

export function leerCifradoNeurona(neurona: string): EtiquetaCifrado | null {
  if (!neurona) return null;
  try {
    return redLocalNativaActiva()?.cifradoDe?.(neurona) ?? bluetoothDirectoActivo()?.cifradoDe?.(neurona) ?? null;
  } catch {
    return null;
  }
}

export function useCifradoNeurona(neurona: string): EtiquetaCifrado | null {
  const [v, setV] = useState<EtiquetaCifrado | null>(null);
  useEffect(() => {
    const leer = () => setV(leerCifradoNeurona(neurona));
    leer();
    const bajas: Array<() => void> = [];
    try {
      const a = redLocalNativaActiva()?.suscribir(leer);
      if (a) bajas.push(a);
      const b = bluetoothDirectoActivo()?.suscribir(leer);
      if (b) bajas.push(b);
    } catch {
      /* sin red nativa: solo el sondeo */
    }
    const t = setInterval(leer, 5000);
    return () => {
      clearInterval(t);
      for (const f of bajas) f();
    };
  }, [neurona]);
  return v;
}
