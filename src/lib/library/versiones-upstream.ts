// StarSeed OS — Biblioteca · Resumen de versiones upstream (LIB1025A · Ola 1025R)
// Módulo PURO (sin node:*, sin red ni reloj): convierte la respuesta de
// /api/library/actualizaciones en filas con un tono y un texto para personas.

export type EstadoVersion = "igual" | "hay-actualizacion" | "desconocida";

/** Copia estructural de `FuenteActualizacion`; la ruta de Next no se importa. */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoVersion;
    fecha: string | null;
    upstream: string;
    aviso: string | null;
}

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

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

export function normalizarVersion(v: string): string {
    const limpia = v.toLowerCase().replace(/\s+/g, "");
    const trasArroba = limpia.includes("@")
        ? limpia.slice(limpia.lastIndexOf("@") + 1)
        : limpia;
    const sinV = /^v\d/.test(trasArroba) ? trasArroba.slice(1) : trasArroba;
    return RE_SHA.test(sinV) ? sinV.slice(0, 7) : sinV;
}

function tonoDe(fuente: FuenteVersion): TonoVersion {
    if (fuente.remota === null || fuente.remota === "") return "sin-comprobar";
    if (fuente.estado === "hay-actualizacion") return "novedad";
    if (fuente.estado === "igual") return "al-dia";
    const remota = normalizarVersion(fuente.remota);
    const instalada = normalizarVersion(fuente.instalada);
    return remota !== instalada ? "novedad" : "al-dia";
}

function textoDe(fuente: FuenteVersion, tono: TonoVersion): string {
    if (tono === "sin-comprobar") return "No se pudo comprobar ahora";
    const fecha = fuente.fecha ? ` (${fuente.fecha})` : "";
    if (tono === "novedad") {
        return `Versión nueva publicada: ${fuente.remota} (la ficha tiene ${fuente.instalada})${fecha}`;
    }
    return `Al día (${fuente.remota ?? fuente.instalada})${fecha}`;
}

export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const resumen: ResumenVersion[] = [];
    for (const fuente of fuentes) {
        if (!idsInstalados.has(fuente.id)) continue;
        const tono = tonoDe(fuente);
        resumen.push({
            id: fuente.id,
            tono,
            texto: textoDe(fuente, tono),
            instalada: fuente.instalada,
            remota: fuente.remota,
            fecha: fuente.fecha,
            upstream: fuente.upstream,
        });
    }
    return resumen;
}

export function contarNovedades(r: ResumenVersion[]): number {
    return r.filter((item) => item.tono === "novedad").length;
}
