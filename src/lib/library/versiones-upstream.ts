// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (Ola 1025R · LIB1025A)
// ------------------------------------------------------------------------------
// Módulo PURO: sin red, sin disco, sin reloj. Convierte la respuesta de
// /api/library/actualizaciones (FuenteActualizacion[]) en un resumen legible
// por persona, entendiendo también releases y etiquetas que compararVersiones
// deja como «desconocida». La ruta de Next NO se importa: los tipos van
// duplicados aquí a propósito (una ruta solo exporta GET/POST/etc.).
// ════════════════════════════════════════════════════════════════════════════

/* ───────────────────────────── Tipos ───────────────────────────── */

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

/** Copia estructural de `FuenteActualizacion` (definida en la ruta de Next). */
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

/* ─────────────────── Normalización de versiones ─────────────────── */

const RE_SHA = /^[0-9a-f]{7,40}$/;

/**
 * Pone una versión en forma comparable: minúsculas, sin espacios, solo lo que
 * va tras la última `@` (así `@cloudflare/computer@0.7.0` y `0.7.0`
 * coinciden), sin una `v` inicial seguida de dígito y, si es un SHA de 7 a 40
 * hexadecimales, reducida a sus 7 primeros caracteres.
 */
export function normalizarVersion(v: string): string {
    let base = v.toLowerCase().replace(/\s+/g, "");
    const arroba = base.lastIndexOf("@");
    if (arroba >= 0) base = base.slice(arroba + 1);
    if (/^v\d/.test(base)) base = base.slice(1);
    return RE_SHA.test(base) ? base.slice(0, 7) : base;
}

/* ═══════════ Resumen de fuentes ═══════════ */

/**
 * Cómo quedó cada fuente en una sola línea de texto, sin inventar ninguna
 * versión. Si `remota` es null nunca es «novedad»: sin remota no hay
 * comprobación, y una comparación fallida no debe sonar a alarma.
 */
export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    return fuentes
        .filter((fuente) => idsInstalados.has(fuente.id))
        .map((fuente) => {
            const { id, instalada, remota, estado, fecha, upstream } = fuente;
            const tono = tonoDe(fuente);
            return {
                id,
                tono,
                texto: textoDe(tono, instalada, remota, fecha),
                instalada,
                remota,
                fecha,
                upstream,
            };
        });
}

function tonoDe(fuente: FuenteVersion): TonoVersion {
    const { instalada, remota, estado } = fuente;
    if (!remota) return "sin-comprobar";
    const difieren = normalizarVersion(remota) !== normalizarVersion(instalada);
    if (estado === "hay-actualizacion" || difieren) return "novedad";
    if (estado === "igual" || !difieren) return "al-dia";
    return "sin-comprobar";
}

function textoDe(
    tono: TonoVersion,
    instalada: string,
    remota: string | null,
    fecha: string | null,
): string {
    let texto: string;
    if (tono === "novedad") {
        texto = `Versión nueva publicada: ${remota ?? ""} (la ficha tiene ${instalada})`;
    } else if (tono === "al-dia") {
        texto = `Al día (${instalada})`;
    } else {
        texto = "No se pudo comprobar ahora";
    }
    if (fecha && tono !== "sin-comprobar") {
        texto += ` (${fecha})`;
    }
    return texto;
}

/* ─────────────────── Conteo de novedades ─────────────────── */

/** Cuántas fuentes del resumen tienen una versión nueva publicada. */
export function contarNovedades(resumen: ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
