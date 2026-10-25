// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (LIB1025A · 1025R)
// ------------------------------------------------------------------------------
// Módulo PURO (sin node:*, sin red ni reloj): resume lo que devuelve
// /api/library/actualizaciones para las fichas que están instaladas. La
// comparación automática de la ruta solo entiende SHA de commit: aquí las
// versiones se normalizan (etiquetas con prefijo de paquete, releases con
// «v», SHA de 7 o 40 hexadecimales) para poder mostrar «al día», «novedad»
// o «sin comprobar» también en releases y etiquetas.
// ════════════════════════════════════════════════════════════════════════════

/* ───────────────────────────── Tipos ───────────────────────────── */

export type EstadoVersion = "igual" | "hay-actualizacion" | "desconocida";

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

/** Copia estructural de `FuenteActualizacion` (la ruta de Next no se importa). */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoVersion;
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

/* ───────────────────── Normalización de versiones ───────────────────── */

const RE_SHA = /^[0-9a-f]{7,40}$/;

/**
 * Pone una versión en forma comparable: minúsculas, sin espacios, lo que va
 * tras la última `@` (así `@cloudflare/computer@0.7.0` y `0.7.0` coinciden),
 * sin una `v` inicial seguida de dígito y, si es un SHA de 7 a 40
 * hexadecimales, sus 7 primeros caracteres. Cambia la forma, no la versión:
 * nunca inventa una.
 */
export function normalizarVersion(v: string): string {
    let s = v.toLowerCase().replace(/\s+/g, "");
    const arroba = s.lastIndexOf("@");
    if (arroba >= 0) s = s.slice(arroba + 1);
    s = s.replace(/^v(\d)/, "$1");
    if (RE_SHA.test(s)) s = s.slice(0, 7);
    return s;
}

/* ───────────────────── Resumen de las fuentes ───────────────────── */

function conFecha(texto: string, fecha: string | null): string {
    return fecha ? `${texto} (${fecha})` : texto;
}

/**
 * Solo los ids instalados, en el orden de entrada. `remota: null` nunca da
 * «novedad». Para releases y etiquetas (donde la ruta devuelve
 * `estado: "desconocida"`) compara las versiones normalizadas por su cuenta.
 */
export function resumirVersiones(
    fuentes: readonly FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const resumen: ResumenVersion[] = [];
    for (const f of fuentes) {
        if (!idsInstalados.has(f.id)) continue;
        const remotaNorm = f.remota ? normalizarVersion(f.remota) : null;
        const instaladaNorm = normalizarVersion(f.instalada);
        const difieren = f.estado !== "igual" && remotaNorm !== instaladaNorm;
        let tono: TonoVersion;
        let texto: string;
        if (!remotaNorm) {
            tono = "sin-comprobar";
            texto = conFecha("No se pudo comprobar ahora", f.fecha);
        } else if (f.estado === "hay-actualizacion" || difieren) {
            tono = "novedad";
            texto = conFecha(
                `Versión nueva publicada: ${f.remota} (la ficha tiene ${f.instalada})`,
                f.fecha,
            );
        } else {
            tono = "al-dia";
            texto = conFecha(`Al día (${f.instalada})`, f.fecha);
        }
        resumen.push({
            id: f.id,
            tono,
            texto,
            instalada: f.instalada,
            remota: f.remota,
            fecha: f.fecha,
            upstream: f.upstream,
        });
    }
    return resumen;
}

/* ───────────────────── Conteo ───────────────────── */

/** Cuántas de las fichas resumidas tienen una versión nueva publicada. */
export function contarNovedades(resumen: readonly ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
