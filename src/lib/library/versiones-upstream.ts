export type FuenteVersion = {
    id: string;
    instalada: string;
    remota: string | null;
    estado: "igual" | "hay-actualizacion" | "desconocida";
    fecha: string | null;
    upstream: string;
    aviso: string | null;
};

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

export type ResumenVersion = {
    id: string;
    tono: TonoVersion;
    texto: string;
    instalada: string;
    remota: string | null;
    fecha: string | null;
    upstream: string;
};

const ES_SHA = /^[0-9a-f]{7,40}$/;

/** Normaliza una cadena de versión para poder comparar remotas e instaladas. */
export function normalizarVersion(v: string): string {
    const limpia = v.trim().toLowerCase().replace(/\s+/g, "");
    const conPrefijo = limpia.includes("@") ? limpia.slice(limpia.lastIndexOf("@") + 1) : limpia;
    const sinV = /^v[0-9]/.test(conPrefijo) ? conPrefijo.slice(1) : conPrefijo;
    return ES_SHA.test(sinV) ? sinV.slice(0, 7) : sinV;
}

/* ── Textos para personas ── */

function textoDe(tono: TonoVersion, r: FuenteVersion): string {
    const conFecha = (base: string): string =>
        r.fecha ? `${base} (${r.fecha})` : base;
    switch (tono) {
        case "sin-comprobar":
            return conFecha("No se pudo comprobar ahora");
        case "novedad":
            return conFecha(`Versión nueva publicada: ${r.remota ?? ""} (la ficha tiene ${r.instalada})`);
        default:
            return conFecha(`Al día (${r.instalada})`);
    }
}

function tonoDe(r: FuenteVersion): TonoVersion {
    if (!r.remota) return "sin-comprobar";
    const comparable = normalizarVersion(r.remota) !== normalizarVersion(r.instalada);
    if (r.estado === "hay-actualizacion" || comparable) return "novedad";
    if (r.estado === "igual" || !comparable) return "al-dia";
    return "al-dia";
}

/** Resumen en solo lectura de las versiones upstream de lo instalado. */
export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    return fuentes
        .filter((r) => idsInstalados.has(r.id))
        .map((r): ResumenVersion => {
            const tono = tonoDe(r);
            return {
                id: r.id,
                tono,
                texto: textoDe(tono, r),
                instalada: r.instalada,
                remota: r.remota,
                fecha: r.fecha,
                upstream: r.upstream,
            };
        });
}

/** Cuenta cuántas fuentes tienen versión nueva publicada pendiente. */
export function contarNovedades(resumen: ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
