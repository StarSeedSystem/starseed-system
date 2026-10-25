// Resumen puro de las versiones upstream de lo instalado en la Librería.
// Sin red, sin disco, sin reloj: todo entra por parámetro (Ola 1025R).

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

/** Copia estructural de FuenteActualizacion de la ruta de actualizaciones. */
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

const PATRON_SHA = /^[0-9a-f]{7,40}$/;

/** Minúsculas, sin espacios, tras la última `@`, sin `v` inicial y SHA acortado a 7. */
export function normalizarVersion(v: string): string {
    let texto = v.toLowerCase().trim();
    const ultimaArroba = texto.lastIndexOf("@");
    if (ultimaArroba >= 0 && ultimaArroba < texto.length - 1) {
        texto = texto.slice(ultimaArroba + 1);
    }
    if (/^v\d/.test(texto)) texto = texto.slice(1);
    if (PATRON_SHA.test(texto)) texto = texto.slice(0, 7);
    return texto;
}

function parentesis(fecha: string | null): string {
    return fecha ? ` (${fecha})` : "";
}

function textoDe(tono: TonoVersion, instalada: string, remota: string | null, fecha: string | null): string {
    if (tono === "sin-comprobar") return "No se pudo comprobar ahora";
    if (tono === "novedad") {
        return `Versión nueva publicada: ${remota ?? ""} (la ficha tiene ${instalada})${parentesis(fecha)}`;
    }
    return `Al día (${instalada})${parentesis(fecha)}`;
}

/** Resumen solo de lo instalado, en el orden de entrada; nunca inventa versión. */
export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const salida: ResumenVersion[] = [];
    for (const fuente of fuentes) {
        if (!idsInstalados.has(fuente.id)) continue;
        if (!fuente.remota) {
            salida.push({
                id: fuente.id,
                tono: "sin-comprobar",
                texto: textoDe("sin-comprobar", fuente.instalada, null, null),
                instalada: fuente.instalada,
                remota: null,
                fecha: null,
                upstream: fuente.upstream,
            });
            continue;
        }
        const instalada = normalizarVersion(fuente.instalada);
        const remota = normalizarVersion(fuente.remota);
        const coincide = instalada === remota || fuente.estado === "igual";
        const tono: TonoVersion =
            fuente.estado === "hay-actualizacion" || !coincide ? "novedad" : "al-dia";
        salida.push({
            id: fuente.id,
            tono,
            texto: textoDe(tono, fuente.instalada, fuente.remota, fuente.fecha),
            instalada: fuente.instalada,
            remota: fuente.remota,
            fecha: fuente.fecha,
            upstream: fuente.upstream,
        });
    }
    return salida;
}

/** Cuántas fichas instaladas tienen versión nueva publicada. */
export function contarNovedades(resumen: ResumenVersion[]): number {
    return resumen.filter((r) => r.tono === "novedad").length;
}
