// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen puro de versiones upstream (Ola 1025R)
// ------------------------------------------------------------------------------
// La ruta /api/library/actualizaciones ya comprueba los upstream y devuelve
// FuenteActualizacion, pero ningún componente de src/ la consume. Este módulo
// PURO la traduce a fichas de una línea: sin red, disco ni reloj, importable
// desde cliente (una ruta de Next solo exporta GET/POST/etc.: nunca la imports).
// ════════════════════════════════════════════════════════════════════════════

import type { EstadoActualizacion } from "@/lib/library/actualizaciones";

/** Copia estructural de FuenteActualizacion de la ruta (sin importarla). */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoActualizacion;
    fecha: string | null;
    upstream: string;
    aviso: string | null;
}

/** Tono de la ficha en la tarjeta: al día, novedad o sin comprobar. */
export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

/** Ficha de una línea para la tarjeta de una fuente instalada. */
export interface ResumenVersion {
    id: string;
    tono: TonoVersion;
    texto: string;
    instalada: string;
    remota: string | null;
    fecha: string | null;
    upstream: string;
}

/* ───────────────────── Normalización ───────────────────── */

/** Versión comparable: minúsculas, sin espacios, lo que va tras la última «@»
 * (así `@cloudflare/computer@0.7.0` y `0.7.0` coinciden), sin «v» inicial
 * seguida de dígito y, si es SHA de 7 a 40 hex, sus 7 primeros caracteres. */
export function normalizarVersion(v: string): string {
    let t = v.toLowerCase().replace(/\s+/g, "");
    const arroba = t.lastIndexOf("@");
    if (arroba >= 0) t = t.slice(arroba + 1);
    t = t.replace(/^v(\d)/, "$1");
    if (/^[0-9a-f]{7,40}$/.test(t)) t = t.slice(0, 7);
    return t;
}

/* ───────────────────── Resumen ───────────────────── */

/** Fecha entre paréntesis al final del texto, si existe. */
function conFecha(texto: string, fecha: string | null): string {
    return fecha ? `${texto} (${fecha})` : texto;
}

function ficha(f: FuenteVersion, tono: TonoVersion, texto: string): ResumenVersion {
    return {
        id: f.id,
        tono,
        texto,
        instalada: f.instalada,
        remota: tono === "sin-comprobar" ? null : f.remota,
        fecha: f.fecha,
        upstream: f.upstream,
    };
}

/**
 * Resumen de las fuentes INSTALADAS, en el orden de entrada. Tono «novedad»
 * si el estado es «hay-actualizacion» o si hay remota y su versión
 * normalizada difiere de la instalada; «al-día» si coinciden (o el estado es
 * «igual»); «sin-comprobar» si no hay remota. Sin remota nunca hay novedad y
 * nunca se inventa una versión.
 */
export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const fichasResumen: ResumenVersion[] = [];
    for (const f of fuentes) {
        if (!idsInstalados.has(f.id)) continue;
        if (!f.remota) {
            fichasResumen.push(ficha(f, "sin-comprobar", conFecha("No se pudo comprobar ahora", f.fecha)));
        } else if (
            f.estado === "hay-actualizacion" ||
            normalizarVersion(f.remota) !== normalizarVersion(f.instalada)
        ) {
            fichasResumen.push(
                ficha(
                    f,
                    "novedad",
                    conFecha(
                        `Versión nueva publicada: ${f.remota} (la ficha tiene ${f.instalada})`,
                        f.fecha,
                    ),
                ),
            );
        } else {
            fichasResumen.push(ficha(f, "al-dia", conFecha(`Al día (${f.instalada})`, f.fecha)));
        }
    }
    return fichasResumen;
}

/** Cuántas fuentes del resumen tienen versión nueva upstream. */
export function contarNovedades(resumen: ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
