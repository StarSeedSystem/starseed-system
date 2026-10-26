"use client";

/**
 * La grabadora única (`controladorGlobal`) como estado de React. Suscribirse NO crea nada pesado ni
 * pide permisos: el controlador solo se construye al montar la vista en el cliente. Se puede inyectar
 * uno propio (pruebas).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { controladorGlobal, instantaneaDelServidor } from "@/lib/grabacion/global";
import type { Controlador } from "@/lib/grabacion/controlador";
import { duracionMs } from "@/lib/grabacion/maquina";
import type { Instantanea } from "@/lib/grabacion/tipos";

export interface UsoGrabadora {
  controlador: Controlador;
  estado: Instantanea;
}

export function useGrabadora(inyectado?: Controlador): UsoGrabadora {
  const controlador = useMemo(() => inyectado ?? controladorGlobal(), [inyectado]);
  const estado = useSyncExternalStore(controlador.suscribir, controlador.obtener, instantaneaDelServidor);
  return { controlador, estado };
}

/** Milisegundos grabados, refrescados cada 250 ms solo mientras corre el reloj. */
export function useDuracionEnVivo(estado: Instantanea, ahora: () => number = () => performance.now()): number {
  const [, forzar] = useState(0);
  const ahoraRef = useRef(ahora);
  ahoraRef.current = ahora;
  const corre = estado.fase === "grabando";
  useEffect(() => {
    if (!corre) return;
    const id = window.setInterval(() => forzar((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [corre]);
  return duracionMs(estado, ahoraRef.current());
}
