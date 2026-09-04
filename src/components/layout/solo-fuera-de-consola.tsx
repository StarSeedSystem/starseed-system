"use client";

/**
 * `<SoloFueraDeConsola>` — cromo del OS que NO se monta en las rutas de consola.
 * ---------------------------------------------------------------------------
 * El Puente de Mando (`/mando`) es una herramienta de trabajo que se abre mientras
 * los agentes escriben. En una máquina de 8 GB, cada fondo WebGL, cada host de
 * ventanas y cada overlay le quita sitio a un agente: hemos visto la Mac bajar a
 * 650 MB libres y provocar parones de siete minutos en tareas que iban bien.
 *
 * Esto no oculta con CSS: devuelve `null`, así que los componentes ni se montan y
 * no hay efectos, timers, WebGL ni suscripciones corriendo detrás.
 *
 * Los PROVEEDORES de contexto nunca se envuelven aquí —los hijos los necesitan—:
 * solo el cromo visual.
 */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Rutas que son consola de trabajo, no escaparate. */
export const RUTAS_CONSOLA = ["/mando"];

export function esRutaConsola(ruta: string | null): boolean {
    return Boolean(ruta && RUTAS_CONSOLA.some((r) => ruta.startsWith(r)));
}

export function SoloFueraDeConsola({ children }: { children: ReactNode }) {
    const ruta = usePathname();
    if (esRutaConsola(ruta)) return null;
    return <>{children}</>;
}
