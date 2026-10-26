/**
 * Paquete de diseños de iconos (Ola 1025U · V1b): el sobre JSON con el que un diseño o una plantilla se
 * guarda en la Biblioteca, se comparte en la Librería («Diseños de iconos») o se exporta como archivo.
 *
 *   { formato: "starseed.iconos", version: 1, tipo: "diseno" | "plantilla", creado, diseno | plantilla }
 *
 * Leer un paquete NUNCA confía en él: pasa por `normalizarDiseno` / `leerPlantilla` (colores en hex, SVG
 * saneado, imágenes solo `data:` pequeñas, tamaños acotados). Un texto que no sea el sobre, o que pese
 * demasiado, se rechaza con el motivo.
 */

import {
    LIMITES,
    leerPlantilla,
    normalizarDiseno,
    type DisenoIcono,
    type PlantillaIconos,
} from "./modelo";

export const FORMATO_PAQUETE = "starseed.iconos" as const;
export const VERSION_PAQUETE = 1 as const;
/** Etiqueta con la que se reconocen estos elementos en la Biblioteca y en la Librería. */
export const ETIQUETA_BIBLIOTECA = "starseed-iconos" as const;
export const MIME_PAQUETE = "application/vnd.starseed.iconos+json" as const;
/** Un paquete de texto no pasa de esto al leerlo (la plantilla ya tiene su propio tope menor). */
export const MAX_PAQUETE_CARACTERES = 400_000;

export type TipoPaquete = "diseno" | "plantilla";

export interface PaqueteIconos {
    formato: typeof FORMATO_PAQUETE;
    version: typeof VERSION_PAQUETE;
    tipo: TipoPaquete;
    creado: string;
    /** Quién lo hizo y con qué licencia se comparte (las plantillas ya lo llevan dentro; los diseños sueltos, aquí). */
    autor?: string;
    licencia?: string;
    diseno?: DisenoIcono;
    plantilla?: PlantillaIconos;
}

export interface MetaPaquete { autor?: string; licencia?: string }

function textoCorto(x: unknown, max: number): string | undefined {
    if (typeof x !== "string") return undefined;
    const t = x.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    return t || undefined;
}

export function empaquetarDiseno(diseno: DisenoIcono, ahora: Date = new Date(), meta: MetaPaquete = {}): PaqueteIconos {
    const autor = textoCorto(meta.autor, LIMITES.autorMax);
    const licencia = textoCorto(meta.licencia, LIMITES.licenciaMax);
    return {
        formato: FORMATO_PAQUETE, version: VERSION_PAQUETE, tipo: "diseno", creado: ahora.toISOString(),
        ...(autor ? { autor } : {}), ...(licencia ? { licencia } : {}), diseno,
    };
}

export function empaquetarPlantilla(plantilla: PlantillaIconos, ahora: Date = new Date()): PaqueteIconos {
    return { formato: FORMATO_PAQUETE, version: VERSION_PAQUETE, tipo: "plantilla", creado: ahora.toISOString(), plantilla };
}

export function paqueteATexto(p: PaqueteIconos): string {
    return JSON.stringify(p, null, 2);
}

export interface LecturaPaquete {
    ok: boolean;
    tipo?: TipoPaquete;
    diseno?: DisenoIcono;
    plantilla?: PlantillaIconos;
    autor?: string;
    licencia?: string;
    /** Por qué falló, o qué se descartó (diseños de la plantilla no válidos…). */
    motivos: string[];
}

/** Lee un paquete desde texto (archivo, Biblioteca, Librería). Nunca lanza. */
export function leerPaquete(entrada: unknown): LecturaPaquete {
    let crudo: unknown = entrada;
    if (typeof entrada === "string") {
        if (entrada.length > MAX_PAQUETE_CARACTERES) return { ok: false, motivos: ["El archivo es demasiado grande para ser un diseño de iconos."] };
        try { crudo = JSON.parse(entrada); } catch { return { ok: false, motivos: ["No es un archivo JSON válido."] }; }
    }
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return { ok: false, motivos: ["No es un paquete de iconos de StarSeed."] };
    const p = crudo as Record<string, unknown>;
    if (p.formato !== FORMATO_PAQUETE) return { ok: false, motivos: ["No es un paquete de iconos de StarSeed."] };
    if (typeof p.version !== "number" || p.version > VERSION_PAQUETE) {
        return { ok: false, motivos: ["Es de una versión más nueva que esta; actualiza StarSeed para abrirlo."] };
    }
    if (p.tipo === "diseno") {
        const d = normalizarDiseno(p.diseno);
        if (!d) return { ok: false, motivos: ["El diseño no es válido (o su dibujo no pasó el filtro de seguridad)."] };
        const autor = textoCorto(p.autor, LIMITES.autorMax);
        const licencia = textoCorto(p.licencia, LIMITES.licenciaMax);
        return { ok: true, tipo: "diseno", diseno: d, ...(autor ? { autor } : {}), ...(licencia ? { licencia } : {}), motivos: [] };
    }
    if (p.tipo === "plantilla") {
        const l = leerPlantilla(p.plantilla);
        if (!l.plantilla) return { ok: false, motivos: l.motivos };
        return { ok: true, tipo: "plantilla", plantilla: l.plantilla, motivos: l.motivos };
    }
    return { ok: false, motivos: ["El paquete no dice si es un diseño o una plantilla."] };
}

/** Nombre de archivo seguro para descargar: `base.ext`, sin rutas ni caracteres raros. */
export function nombreArchivo(base: string, extension: "json" | "svg"): string {
    const limpio = base
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "iconos";
    return `starseed-${limpio}.${extension}`;
}

