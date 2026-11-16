/** Modelos de traducción locales (Xenova/opus-mt-<origen>-<destino>) para pares con inglés como centro.
 *  Datos honestos: verificado:false en todas las filas; bytes como estimación; hash vacío hasta verificar. */

export interface PaqueteModelo {
    readonly origen: string;
    readonly destino: string;
    readonly repo: string;
    readonly verificado: false;
    readonly bytes: number;
    readonly hash: "";
}

export type EstadoPar = "solo-internet" | "descarga" | "sin-internet";

export interface RutaDosSaltos {
    readonly ruta: readonly [string, "en", string];
    readonly aviso: "dos pasos, peor calidad";
}

const BYTES_POR_MODELO = 60_000_000;

export const MODELOS_LOCALES: readonly PaqueteModelo[] = [
    { origen: "es", destino: "en", repo: "Xenova/opus-mt-es-en", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "en", destino: "es", repo: "Xenova/opus-mt-en-es", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "fr", destino: "en", repo: "Xenova/opus-mt-fr-en", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "en", destino: "fr", repo: "Xenova/opus-mt-en-fr", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "de", destino: "en", repo: "Xenova/opus-mt-de-en", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "en", destino: "de", repo: "Xenova/opus-mt-en-de", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "pt", destino: "en", repo: "Xenova/opus-mt-pt-en", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "en", destino: "pt", repo: "Xenova/opus-mt-en-pt", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "it", destino: "en", repo: "Xenova/opus-mt-it-en", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
    { origen: "en", destino: "it", repo: "Xenova/opus-mt-en-it", verificado: false, bytes: BYTES_POR_MODELO, hash: "" },
] as const;

export function modeloPara(origen: string, destino: string): PaqueteModelo | undefined {
    return MODELOS_LOCALES.find((m) => m.origen === origen && m.destino === destino);
}

export function estadoDePar(origen: string, destino: string, instalados: readonly string[]): EstadoPar {
    const modelo = modeloPara(origen, destino);
    if (!modelo) return "solo-internet";
    return instalados.includes(modelo.repo) ? "sin-internet" : "descarga";
}

export function ruta2saltos(origen: string, destino: string): RutaDosSaltos | undefined {
    if (origen === destino) return undefined;
    if (modeloPara(origen, destino)) return undefined;
    const tieneOrigenEn = modeloPara(origen, "en") || modeloPara("en", origen);
    const tieneDestinoEn = modeloPara(destino, "en") || modeloPara("en", destino);
    if (tieneOrigenEn && tieneDestinoEn) {
        return { ruta: [origen, "en", destino] as const, aviso: "dos pasos, peor calidad" };
    }
    return undefined;
}