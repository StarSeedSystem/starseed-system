/**
 * Preferencias de traducción por perfil (Ola 1020U · TRD1020D).
 *
 * Cada perfil guarda su idioma de lectura, los idiomas que ya entiende y qué
 * hacer en cada contexto (páginas, mensajes, publicaciones, agentes y
 * Astraura): «nunca», «preguntar» o «siempre». Viaja con la cuenta como el
 * resto de ajustes (`starseed.traduccion.v1`, ver `SYNCED_KEYS`), pero el
 * valor por defecto lo aporta quien llama (p. ej. `navigator.language`).
 *
 * Módulo puro de cliente: no importa `node:*` ni toca la red. El acceso a
 * `localStorage` está guardado por si se ejecuta en el servidor.
 */

export const CLAVE_TRADUCCION = "starseed.traduccion.v1";
export const EVENTO_TRADUCCION = "starseed:traduccion";

export type ContextoTraduccion = "paginas" | "mensajes" | "publicaciones" | "agentes" | "astraura";
export type ModoAuto = "nunca" | "preguntar" | "siempre";
export type AutoTraduccion = Record<ContextoTraduccion, ModoAuto>;

export interface PerfilTraduccion {
    idioma: string;
    entiende: string[];
    auto: AutoTraduccion;
}

export interface PreferenciasTraduccion {
    v: 1;
    perfiles: Record<string, PerfilTraduccion>;
}

export const CONTEXTOS: readonly ContextoTraduccion[] = [
    "paginas",
    "mensajes",
    "publicaciones",
    "agentes",
    "astraura",
];

const MODOS: readonly ModoAuto[] = ["nunca", "preguntar", "siempre"];

/** Idioma base en minúsculas: `es-MX` y `ES_mx` → `es`. */
export function normalizarIdioma(idioma: string): string {
    return idioma.trim().toLowerCase().replace("_", "-").split("-")[0];
}

export function esModoAuto(valor: unknown): valor is ModoAuto {
    return typeof valor === "string" && (MODOS as readonly string[]).includes(valor);
}

function autoPorDefecto(): AutoTraduccion {
    return {
        paginas: "preguntar",
        mensajes: "preguntar",
        publicaciones: "preguntar",
        agentes: "preguntar",
        astraura: "preguntar",
    };
}

/** Valor por defecto de un perfil: su idioma (el de quien llama) y todo en «preguntar». */
export function preferenciasPorDefecto(idioma: string): PerfilTraduccion {
    const base = normalizarIdioma(idioma) || "es";
    // Quien lee en un idioma lo entiende: sin esto se «traduciría» de es a es.
    return { idioma: base, entiende: [base], auto: autoPorDefecto() };
}
