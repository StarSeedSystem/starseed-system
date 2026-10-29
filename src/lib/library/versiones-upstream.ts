// Resumen puro de las versiones upstream de lo instalado en la Biblioteca (Ola 1025R).
// Copia estructural de `FuenteActualizacion` (la ruta de Next solo exporta GET, no se importa).

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

const ES_SHA = /^[0-9a-f]{7,40}$/;

export function normalizarVersion(v: string): string {
    let s = v.trim().toLowerCase().replace(/\s+/g, "");
    const arroba = s.lastIndexOf("@");
    if (arroba !== -1) s = s.slice(arroba + 1);
    if (/^v\d/.test(s)) s = s.slice(1);
    if (ES_SHA.test(s)) s = s.slice(0, 7);
    return s;
}

function textoDe(
    tono: TonoVersion,
    instalada: string,
    remota: string | null,
    fecha: string | null,
): string {
    const sobre = fecha ? ` (${fecha})` : "";
    if (tono === "sin-comprobar") return "No se pudo comprobar ahora";
    if (tono === "novedad") {
        return `Versión nueva publicada: ${remota ?? ""} (la ficha tiene ${instalada})${sobre}`;
    }
    return `Al día (${instalada})${sobre}`;
}

export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    return fuentes
        .filter((f) => idsInstalados.has(f.id))
        .map((f) => {
            let tono: TonoVersion;
            if (f.remota === null) {
                tono = "sin-comprobar";
            } else if (
                f.estado === "hay-actualizacion" ||
                normalizarVersion(f.remota) !== normalizarVersion(f.instalada)
            ) {
                tono = "novedad";
            } else {
                tono = "al-dia";
            }
            return {
                id: f.id,
                tono,
                texto: textoDe(tono, f.instalada, f.remota, f.fecha),
                instalada: f.instalada,
                remota: f.remota,
                fecha: f.fecha,
                upstream: f.upstream,
            };
        });
}

export function contarNovedades(resumen: ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
