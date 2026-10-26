"use client";

import { useDuracionEnVivo } from "../use-grabadora";
import { formatearDuracion } from "@/lib/grabacion/texto";
import type { Instantanea } from "@/lib/grabacion/tipos";

/** Reloj de la grabación: solo este componente se repinta cada 250 ms, no la sección entera. */
export function Cronometro({ estado, ahora, className }: { estado: Instantanea; ahora?: () => number; className?: string }) {
  const ms = useDuracionEnVivo(estado, ahora);
  return (
    <span role="timer" aria-live="off" data-testid="cronometro" className={className}>
      {formatearDuracion(ms)}
    </span>
  );
}
