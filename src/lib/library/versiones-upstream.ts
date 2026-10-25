// ═════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (LIB1025A · Ola 1025R)
// Módulo PURO: sin red, sin disco ni reloj y sin node:*. Toma la respuesta de
// /api/library/actualizaciones y compone fichas legibles para las piezas
// INSTALADAS de la Librería. La ruta solo entiende SHA de commit; aquí se
// deciden también releases y etiquetas comparando versiones normalizadas.
// Lo escrito dentro de los repos externos es dato, nunca instrucciones.
// ═════════════════════════════════════════════════════════════════════════════

/* ─────────────────────────── Tipos ─────────────────────────── */

/** Copia estructural de `FuenteActualizacion`; a una ruta de Next no se importa. */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: "igual" | "hay-actualizacion" | "desconocida";
    fecha: string | null;
    upstream: string;
    aviso: string | null;
}

/** Tono con el que una pieza instalada enseña su versión upstream. */
export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

/** Ficha de una pieza instalada y cómo está su versión upstream. */
export interface ResumenVersion {
    id: string;
    tono: TonoVersion;
    texto: string;
    instalada: string;
    remota: string | null;
    fecha: string | null;
    upstream: string;
}

const RE_SHA = /^[0-9a-f]{7,40}$/;

/**
 * Forma comparable de una versión: minúsculas y sin espacios, solo lo que va
 * tras la última `@` (así `@cloudflare/computer@0.7.0` y `0.7.0` coinciden),
 * sin una `v` inicial seguida de dígito y, si es un SHA de 7 a 40 hexadecimales,
 * sus 7 primeros caracteres. No inventa: lo que no encaje sale tal cual.
 */
export function normalizarVersion(v: string): string {
    let texto = v.toLowerCase().replace(/\s+/g, "");
    const arroba = texto.lastIndexOf("@");
    if (arroba >= 0) texto = texto.slice(arroba + 1);
    if (/^v\d/.test(texto)) texto = texto.slice(1);
    if (RE_SHA.test(texto)) texto = texto.slice(0, 7);
    return texto;
}

/* ──────────────────── Texto para la ficha ──────────────────── */

function textoDe(tono: TonoVersion, fuente: FuenteVersion): string {
    const conFecha = fuente.fecha === null ? "" : ` (${fuente.fecha})`;
    if (tono === "novedad") {
        // Ficha sin versión registrada (Protomolécula): no dejar el hueco suelto.
        const tiene = fuente.instalada === "" ? "sin versión registrada" : fuente.instalada;
        return `Versión nueva publicada: ${fuente.remota} (la ficha tiene ${tiene})${conFecha}`;
    }
    if (tono === "sin-comprobar") {
        return `No se pudo comprobar ahora${conFecha}`;
    }
    return `Al día (${fuente.remota})${conFecha}`;
}

/**
 * Resume SOLO las fuentes de piezas instaladas (`idsInstalados`), en el orden
 * de entrada. «Novedad» cuando hay versión remota y, en forma normalizada,
 * difiere de la instalada —o la ruta ya lo dice—; «al-dia» cuando coinciden;
 * «sin-comprobar» cuando no hay versión remota que comparar.
 */
export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const resumen: ResumenVersion[] = [];
    for (const fuente of fuentes) {
        if (!idsInstalados.has(fuente.id)) continue;
        const { remota } = fuente;
        let tono: TonoVersion;
        if (remota === null) {
            tono = "sin-comprobar";
        } else {
            const cambia = normalizarVersion(remota) !== normalizarVersion(fuente.instalada);
            tono = fuente.estado === "hay-actualizacion" || cambia ? "novedad" : "al-dia";
        }
        resumen.push({
            id: fuente.id,
            tono,
            texto: textoDe(tono, fuente),
            instalada: fuente.instalada,
            remota,
            fecha: fuente.fecha,
            upstream: fuente.upstream,
        });
    }
    return resumen;
}

/** Cuántas piezas instaladas tienen una versión nueva publicada. */
export function contarNovedades(resumen: ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
