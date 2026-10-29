// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (Ola 1025R · LIB1025A)
// ──────────────────────────────────────────────────────────────────────────────
// Módulo PURO (sin `node:*`, sin red, sin reloj: el reloj entra por parámetro).
// Convierte la respuesta de /api/library/actualizaciones en una frase legible
// por persona para cada ficha instalada: la comprobación existía y nadie la
// mostraba. Importable desde componentes de cliente.
//
// La comparación automática de `actualizaciones.ts` solo entiende SHA de commit;
// en releases y etiquetas llega `estado: "desconocida"`. Este módulo compara
// además las versiones NORMALIZADAS (ver `normalizarVersion`), sin inventar
// ninguna: si no hay `remota`, el tono es «sin-comprobar», nunca «novedad».
// ════════════════════════════════════════════════════════════════════════════

import type { EstadoActualizacion } from "@/lib/library/actualizaciones";

/* ───────────────────────────── Tipos ───────────────────────────── */

/** Copia estructural de `FuenteActualizacion` de la ruta (no se importa la ruta: exporta GET/POST). */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoActualizacion;
    fecha: string | null;
    upstream: string;
    aviso: string | null;
}

/** Cómo le va a la ficha: al día, con versión nueva publicada o sin poder comprobar ahora. */
export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

/** Una fila del resumen: identificable, con su tono y su frase en español. */
export interface ResumenVersion {
    id: string;
    tono: TonoVersion;
    texto: string;
    instalada: string;
    remota: string | null;
    fecha: string | null;
    upstream: string;
}

/* ───────────────────── Normalización de versiones ───────────────────── */

const RE_SHA = /^[0-9a-f]{7,40}$/;

/**
 * Normaliza un identificador de versión para poder compararlos:
 * minúsculas y sin espacios; se queda con lo que va tras la última `@`
 * (así `@cloudflare/computer@0.7.0` y `0.7.0` coinciden); quita una `v` inicial
 * seguida de dígito (`v2.30.0` y `2.30.0` coinciden) y, si es un SHA de 7 a 40
 * hexadecimales, se queda con sus 7 primeros caracteres (sha corto).
 */
export function normalizarVersion(v: string): string {
    let s = v.trim().toLowerCase().replace(/\s+/g, "");
    const arroba = s.lastIndexOf("@");
    if (arroba !== -1) s = s.slice(arroba + 1);
    s = s.replace(/^v(?=\d)/, "");
    return RE_SHA.test(s) ? s.slice(0, 7) : s;
}

/* ───────────────────────── Tono y frase por fuente ───────────────────────── */

function tonoDe(f: FuenteVersion): TonoVersion {
    if (!f.remota) return "sin-comprobar";
    if (f.estado === "hay-actualizacion") return "novedad";
    if (f.estado === "igual") return "al-dia";
    return normalizarVersion(f.instalada) === normalizarVersion(f.remota) ? "al-dia" : "novedad";
}

/**
 * La frase en español con acentos, determinista según el tono. La fecha va
 * entre paréntesis si existe; las versiones mostradas son las normalizadas,
 * nunca inventadas — «Al día (X)», «Versión nueva publicada: X (la ficha
 * tiene Y)» y «No se pudo comprobar ahora».
 */
function textoDe(tono: TonoVersion, f: FuenteVersion): string {
    if (tono === "sin-comprobar") return "No se pudo comprobar ahora";
    const local = normalizarVersion(f.instalada);
    const remotaNormalizada = normalizarVersion(f.remota ?? "");
    if (tono === "novedad") {
        const quePasa = f.fecha ? `${f.fecha}; ` : "";
        return `Versión nueva publicada: ${remotaNormalizada} (${quePasa}la ficha tiene ${local})`;
    }
    return f.fecha ? `Al día (${local} · ${f.fecha})` : `Al día (${local})`;
}

/* ───────────────────────── Resumen y cuenta ───────────────────────── */

/**
 * Resumen de versiones SOLO de las fichas instaladas (`idsInstalados`), en el
 * orden de entrada. Sin acompañar el estado del upstream: no consulta nada ni
 * inventa versiones — una fuente sin `remota` da «sin-comprobar».
 */
export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const salida: ResumenVersion[] = [];
    for (const f of fuentes) {
        if (!idsInstalados.has(f.id)) continue;
        const tono = tonoDe(f);
        salida.push({
            id: f.id,
            tono,
            texto: textoDe(tono, f),
            instalada: f.instalada,
            remota: f.remota,
            fecha: f.fecha,
            upstream: f.upstream,
        });
    }
    return salida;
}

/** Cuántas filas del resumen traen una versión nueva publicada. */
export function contarNovedades(resumen: readonly ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
