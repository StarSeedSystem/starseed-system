/**
 * El estado que enseña la tarjeta de una ola en «Olas e informes» (2026-09-24).
 *
 * Alex: «en la sección de olas e informes aún aparecen muchas como en curso cuando ya no
 * hay en curso». Era `restantes > 0 → «En curso»`, y `restantes` incluía lo rechazado, lo
 * que pide una persona y lo pendiente: 89 olas «En curso» con cero agentes. Ahora:
 *
 *   · En curso   → algún agente la está escribiendo AHORA (latido vivo).
 *   · Bloqueada  → le queda algo que no avanza solo (rechazada, conflicto, pide una persona).
 *   · En espera  → le queda trabajo, pero nadie lo está haciendo.
 *   · Completa   → todo integrado o cerrado.
 *
 * PURA: sin React, para poder probarla.
 */
import type { OlaResumen } from "@/lib/mando/tipos";

export type EstadoOla = "completa" | "en-curso" | "en-espera" | "bloqueada" | "sin-datos";

export function estadoDeOla(ola: OlaResumen): EstadoOla {
    if (ola.total === 0) return "sin-datos";
    if ((ola.enCurso ?? 0) > 0) return "en-curso";
    if (ola.bloqueantes > 0) return "bloqueada";
    if ((ola.pendientes ?? ola.restantes) > 0) return "en-espera";
    return "completa";
}

/** Las cerradas: integradas o cerradas sin cambios (sustituidas, descartadas…). */
export function hechasDeOla(ola: OlaResumen): number {
    return ola.procesadas + ola.sinCambios;
}

/** «2 en curso · 1 bloqueada · 3 en espera»: lo que le queda, dicho con su motivo. */
export function detalleDeOla(ola: OlaResumen): string {
    const partes: string[] = [];
    const enCurso = ola.enCurso ?? 0;
    const pendientes = ola.pendientes ?? Math.max(0, ola.restantes - enCurso);
    if (enCurso) partes.push(`${enCurso} en curso`);
    if (ola.bloqueantes) partes.push(`${ola.bloqueantes} bloqueada${ola.bloqueantes === 1 ? "" : "s"}`);
    if (pendientes) partes.push(`${pendientes} en espera`);
    return partes.join(" · ");
}

/** Cuántas olas hay en cada estado, para la cabecera del panel. */
export function recuentoDeOlas(olas: OlaResumen[]): Record<EstadoOla, number> {
    const cuenta: Record<EstadoOla, number> = {
        "en-curso": 0,
        bloqueada: 0,
        "en-espera": 0,
        completa: 0,
        "sin-datos": 0,
    };
    for (const ola of olas) cuenta[estadoDeOla(ola)] += 1;
    return cuenta;
}
