// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (Ola 1025R)
// ------------------------------------------------------------------------------
// Módulo PURO (sin `node:*`, sin red, sin reloj): convierte las fuentes que ya
// devuelve `/api/library/actualizaciones` en filas legibles para la Biblioteca.
// La copia estructural de `FuenteActualizacion` evita importar una ruta de Next.
// ════════════════════════════════════════════════════════════════════════════

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

export type EstadoFuenteVersion = "igual" | "hay-actualizacion" | "desconocida";

/** Misma forma que `FuenteActualizacion` de la ruta, sin importarla. */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoFuenteVersion;
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

const RE_SHA = /^[0-9a-f]{7,40}$/;

export function normalizarVersion(v: string): string {
    let texto = v.toLowerCase().replace(/\s+/g, "");
    const arroba = texto.lastIndexOf("@");
    if (arroba !== -1) texto = texto.slice(arroba + 1);
    texto = texto.replace(/^v(?=\d)/, "");
    if (RE_SHA.test(texto)) texto = texto.slice(0, 7);
    return texto;
}

export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    return fuentes.filter((fuente) => idsInstalados.has(fuente.id)).map(resumirFuente);
}

export function contarNovedades(r: ResumenVersion[]): number {
    return r.filter((fila) => fila.tono === "novedad").length;
}

function conFecha(texto: string, fecha: string | null): string {
    return fecha ? `${texto} (${fecha})` : texto;
}

function resumirFuente(fuente: FuenteVersion): ResumenVersion {
    const { id, instalada, remota, estado, fecha, upstream } = fuente;
    const base = { id, instalada, remota, fecha, upstream };

    if (!remota) {
        return {
            ...base,
            tono: "sin-comprobar",
            texto: conFecha("No se pudo comprobar ahora", fecha),
        };
    }

    const coinciden = normalizarVersion(remota) === normalizarVersion(instalada);
    if (estado === "hay-actualizacion" || !coinciden) {
        return {
            ...base,
            tono: "novedad",
            texto: conFecha(
                `Versión nueva publicada: ${remota} (la ficha tiene ${instalada})`,
                fecha,
            ),
        };
    }

    return {
        ...base,
        tono: "al-dia",
        texto: conFecha(`Al día (${remota})`, fecha),
    };
}
