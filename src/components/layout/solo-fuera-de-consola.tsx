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

/** Rutas que son consola de trabajo, no escaparate (sin fondos, hosts ni overlays). */
export const RUTAS_CONSOLA = ["/mando", "/voces"];

/**
 * Rutas MÍNIMAS (2026-09-05): además de lo anterior, sin dock, sin bordes Trinity, sin guía
 * ni ventanas de arranque. Solo la página y la orbe. El Estudio de Voces se usa para PROBAR la
 * voz neuronal en una Mac de 8 GB donde cada capa del OS compite con el modelo por la memoria.
 */
export const RUTAS_MINIMAS = ["/voces"];

export function esRutaConsola(ruta: string | null): boolean {
    return Boolean(ruta && RUTAS_CONSOLA.some((r) => ruta.startsWith(r)));
}

export function esRutaMinima(ruta: string | null): boolean {
    return Boolean(ruta && RUTAS_MINIMAS.some((r) => ruta.startsWith(r)));
}

export function SoloFueraDeConsola({ children }: { children: ReactNode }) {
    const ruta = usePathname();
    if (esRutaConsola(ruta)) return null;
    return <>{children}</>;
}

/** Cromo que tampoco se monta en las rutas mínimas (dock, Trinity, guía, ventanas de arranque). */
export function SoloFueraDeMinima({ children }: { children: ReactNode }) {
    const ruta = usePathname();
    if (esRutaMinima(ruta)) return null;
    return <>{children}</>;
}
