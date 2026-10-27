// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (LIB1025A)
// ------------------------------------------------------------------------------
// Módulo PURO (sin node:*, sin red, sin reloj): normaliza versiones y genera
// resúmenes legibles para la UI. Importable desde componentes de cliente.
// ════════════════════════════════════════════════════════════════════════════

/* ───────────────────────────── Tipos ───────────────────────────── */

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: "igual" | "hay-actualizacion" | "desconocida";
    fecha: string | null;
    upstream: string;
    aviso: string | null;
}

export interface ResumenVersion {
    id: string;
    tono: TonoVersion;
    texto: string;
    instalada: string;
    remota: string | null;
    fecha: string | null;
    upstream: string;
}

/* ───────────────────────── Normalización ───────────────────────── */

const RE_SHA = /^[0-9a-f]{7,40}$/i;

/**
 * Normaliza un identificador de versión para comparaciones.
 * - Minúsculas y sin espacios.
 * - Se queda con lo que va tras la última `@` (p.ej. `@cloudflare/computer@0.7.0` → `0.7.0`).
 * - Quita una `v` inicial seguida de dígito (p.ej. `v1.2.3` → `1.2.3`).
 * - Si es un SHA de 7 a 40 hexadecimales, devuelve sus 7 primeros caracteres.
 */
export function normalizarVersion(v: string): string {
    let s = v.trim().toLowerCase();
    const atIndex = s.lastIndexOf("@");
    if (atIndex !== -1) {
        s = s.slice(atIndex + 1);
    }
    if (/^v\d/.test(s)) {
        s = s.slice(1);
    }
    if (RE_SHA.test(s)) {
        return s.slice(0, 7);
    }
    return s;
}

/* ───────────────────────── Resumen ───────────────────────── */

/**
 * Genera resúmenes legibles solo para los ids instalados, en el orden de entrada.
 * Tono:
 * - "novedad" si `estado === "hay-actualizacion"` o si hay `remota` y su versión
 *   normalizada difiere de la de `instalada`.
 * - "al-dia" si coinciden (o `estado === "igual"`).
 * - "sin-comprobar" si no hay `remota`.
 * Textos en español con la `fecha` entre paréntesis si existe.
 * Nunca inventa una versión.
 */
export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const resultado: ResumenVersion[] = [];
    for (const fuente of fuentes) {
        if (!idsInstalados.has(fuente.id)) continue;

        const instaladaNorm = normalizarVersion(fuente.instalada);
        const remotaNorm = fuente.remota ? normalizarVersion(fuente.remota) : null;
        const fechaStr = fuente.fecha ? ` (${fuente.fecha})` : "";

        let tono: TonoVersion;
        let texto: string;

        if (fuente.remota === null) {
            tono = "sin-comprobar";
            texto = `No se pudo comprobar ahora${fechaStr}`;
        } else if (fuente.estado === "hay-actualizacion" || remotaNorm !== instaladaNorm) {
            tono = "novedad";
            texto = `Versión nueva publicada: ${fuente.remota} (la ficha tiene ${fuente.instalada})${fechaStr}`;
        } else {
            tono = "al-dia";
            texto = `Al día (${fuente.instalada})${fechaStr}`;
        }

        resultado.push({
            id: fuente.id,
            tono,
            texto,
            instalada: fuente.instalada,
            remota: fuente.remota,
            fecha: fuente.fecha,
            upstream: fuente.upstream,
        });
    }
    return resultado;
}

/* ───────────────────────── Conteo ───────────────────────── */

/**
 * Cuenta cuántos resúmenes tienen tono "novedad".
 */
export function contarNovedades(resumenes: ResumenVersion[]): number {
    return resumenes.filter((r) => r.tono === "novedad").length;
}