/** CNX1020A · servicios instalados el 2026-10-20 en el A1 (§7 de architecture/repos-libreria-1020d.md) y cómo se llega a ellos desde la Mac por el túnel de launchd. Módulo puro, sin `node:*` y sin red. */

export const TUNEL_A1 = "com.starseed.tunel-servicios-a1";

export type ServicioA1 = "libretranslate" | "stirling-pdf" | "archivebox" | "comfyui" | "openhands-agent-server";

export interface ServicioA1Info {
    readonly nombre: string;
    /** Dirección que escucha en el A1 (todas en 127.0.0.1, systemd-socket-proxyd bajo demanda). */
    readonly dirA1: string;
    /** Puerto que expone el túnel en la Mac (LibreTranslate difiere: allí 5000, aquí 5100 porque el 5000 de la Mac lo ocupa AirPlay). */
    readonly puertoMac: number;
    /** Versión instalada y medida el 2026-10-20 (§7). */
    readonly version: string;
    /** RAM medida el 2026-10-20; se omite si ese día no se midió: lo honesto. */
    readonly ramMedida?: string;
    /** Memoria que pide `starseed-cabe` para encenderlo bajo demanda. */
    readonly topeMemoria: string;
    /** Variable de entorno que manda sobre las direcciones por defecto si existe. */
    readonly envVar: string;
    readonly nota?: string;
}

export const SERVICIOS_A1: Record<ServicioA1, ServicioA1Info> = {
    libretranslate: {
        nombre: "LibreTranslate", dirA1: "127.0.0.1:5000", puertoMac: 5100, version: "1.9.6",
        ramMedida: "711 MiB", topeMemoria: "1,5 GB", envVar: "LIBRETRANSLATE_URL",
        nota: "En la Mac atiende 5100 porque su 5000 lo ocupa AirPlay; en el A1 sigue en 5000. Idiomas: es, en, pt, fr, de, it.",
    },
    "stirling-pdf": {
        nombre: "Stirling-PDF", dirA1: "127.0.0.1:8180", puertoMac: 8180, version: "3.2.0",
        ramMedida: "1,4 GiB", topeMemoria: "1,5 GB", envVar: "STIRLING_PDF_URL",
        nota: "319 rutas medidas; rotar un PDF de 2 páginas en 0,29 s.",
    },
    archivebox: {
        nombre: "ArchiveBox", dirA1: "127.0.0.1:8001", puertoMac: 8001, version: "0.9.73",
        topeMemoria: "1,2 GB", envVar: "ARCHIVEBOX_URL",
        nota: "Con archive.org, índice público y medios apagados; una página con PDF, captura, SingleFile y HTML en 1 min 16 s. RAM de la instancia sin medir.",
    },
    comfyui: {
        nombre: "ComfyUI", dirA1: "127.0.0.1:8188", puertoMac: 8188, version: "0.42.1",
        ramMedida: "4,1 GB en uso (tope 6 GB)", topeMemoria: "4,5 GB", envVar: "COMFYUI_URL",
        nota: "En CPU + SD 1.5 (fp32, 4,27 GB); una imagen de 512 px con 12 pasos en 713 s: solo cola sin prisa.",
    },
    "openhands-agent-server": {
        nombre: "OpenHands Agent Server", dirA1: "127.0.0.1:8010", puertoMac: 8010, version: "1.7.1",
        ramMedida: "375 MiB en reposo", topeMemoria: "2,5 GB", envVar: "OPENHANDS_AGENT_SERVER_URL",
        nota: "Docker arm64; sano en 14 s; 36 rutas (conversaciones, eventos, ejecutar, pausar, confirmación).",
    },
};

// ── medio y dirección por defecto ──────────────────────────────────────────────────────────────

export interface EntornoOS {
    /** Origen desde el que corre el OS (p. ej. `window.location.origin`); la nativa no depende de él. */
    readonly origen?: string;
    /** El OS corre en la app nativa de la Mac: ese medio sí puede llamar a 127.0.0.1. */
    readonly nativaMac?: boolean;
}

export interface UrlA1 {
    /** URL de la instancia para este medio, o `null` si este medio no puede llamarla. */
    readonly url: string | null;
    /** Por qué es `null`, o qué variable de entorno manda; `null` cuando es la dirección por defecto. */
    readonly motivo: string | null;
}

type Env = Record<string, string | undefined>;

/** ¿Este medio puede llamar a 127.0.0.1? Solo localhost y la app nativa de la Mac. */
export function esMedioLocal(entorno: EntornoOS): boolean {
    if (entorno.nativaMac) return true;
    const o = entorno.origen ?? "";
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o);
}

/**
 * URL de la instancia en este medio: la del túnel de la Mac SOLO cuando el OS corre en localhost
 * o en la app nativa de la Mac (una página https no puede llamar a 127.0.0.1). Las variables
 * `COMFYUI_URL`, `LIBRETRANSLATE_URL`, etc. mandan si existen.
 */
export function urlPorDefecto(servicio: ServicioA1, entorno: EntornoOS, env?: Env): UrlA1 {
    const info = SERVICIOS_A1[servicio];
    const deEnv = (env ?? (typeof process !== "undefined" ? process.env : undefined))?.[info.envVar];
    if (typeof deEnv === "string" && deEnv.length > 0)
        return { url: deEnv, motivo: `manda la variable ${info.envVar}` };
    if (esMedioLocal(entorno)) return { url: `http://127.0.0.1:${info.puertoMac}`, motivo: null };
    if (entorno.origen?.startsWith("https://"))
        return { url: null, motivo: "una página https no puede llamar a 127.0.0.1: el OS corre en localhost o en la app nativa de la Mac" };
    return { url: null, motivo: "medio sin saber si es local: falta el origen y no hay marca de app nativa de la Mac" };
}

/** Cuánto puede tardar la primera llamada (se encienden bajo demanda): `null` = arranque en frío sin medir, no cifra inventada. */
export function esperaFria(servicio: ServicioA1): { segundos: number | null; nota: string } {
    switch (servicio) {
        case "stirling-pdf":
            return { segundos: 109, nota: "arranque en frío medido: 109 s" };
        case "comfyui":
            return { segundos: 22, nota: "arranque medido: 22 s más la carga del modelo SD 1.5 (sin medir por separado)" };
        case "openhands-agent-server":
            return { segundos: 14, nota: "medido: sano en 14 s" };
        case "libretranslate":
            return { segundos: null, nota: "arranque en frío sin medir; servicio caliente: traducir 2 frases en 2,8 s" };
        case "archivebox":
            return { segundos: null, nota: "arranque en frío sin medir; servicio caliente: archivar una página en 1 min 16 s" };
    }
}
