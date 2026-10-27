// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión de archivos · conversores de la malla (CNV1023E)
// ----------------------------------------------------------------------------
// Cuando la neurona que sirve el OS no puede convertir (`/api/conversion`
// responde 404 o 503, p. ej. el OS abierto desde la web pública), se prueba con
// los conversores de la malla de la cuenta, cada uno con la API de CNV1023D
// (misma forma que `/api/conversion`: GET ?de= y POST multipart).
//
// La lista de servidores vive en `starseed.conversion.servidores.v1` como
// {url, tokenRef}: el token NUNCA va en claro en localStorage — es una
// REFERENCIA (nombre) y su valor lo resuelve el almacén de credenciales del OS
// con `tokenDe`, inyectado por quien llama. Módulo PURO: sin `node:*`, la red
// y el resolutor se inyectan para poder probarlo con fetch falso.
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import type { DestinosFormato } from "./formatos";

/** Clave de la lista de conversores de la malla (solo {url, tokenRef}). */
export const SERVIDORES_MALLA_KEY = "starseed.conversion.servidores.v1";

/** Un conversor de la malla: su URL y el NOMBRE del token en la bóveda. */
export interface ServidorMalla {
    /** Base del servidor, p. ej. «https://mi-otra-neurona.local:3000». */
    url: string;
    /** Nombre del token en el almacén de credenciales del OS (nunca el valor). */
    tokenRef?: string;
}

/** Resuelve el valor de un token por su nombre en el almacén de credenciales. */
export type ResolverToken = (tokenRef: string) => Promise<string | null>;

/** Ruta de la API de conversión que sirve CNV1023D (igual en toda la malla). */
export const RUTA_API_MALLA = "/api/conversion";

/** Tope de servidores de la lista: una malla no es una granja de datos. */
const TOPE_SERVIDORES = 8;

/** Quita la barra final y garantiza que sea http(s); null si no vale. */
export function baseDeServidor(url: string): string | null {
    const limpio = String(url ?? "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/i.test(limpio)) return null;
    return limpio;
}

/** URL completa de la API de conversión de un servidor (sin duplicar la ruta). */
export function urlApi(url: string): string {
    const base = baseDeServidor(url);
    if (!base) return "";
    return base.endsWith(RUTA_API_MALLA) ? base : `${base}${RUTA_API_MALLA}`;
}

/** Sanea la lista guardada: solo http(s), sin secretos en claro, sin duplicados. */
export function sanearServidores(crudo: unknown): ServidorMalla[] {
    if (!Array.isArray(crudo)) return [];
    const vistos = new Set<string>();
    const lista: ServidorMalla[] = [];
    for (const entrada of crudo) {
        if (!entrada || typeof entrada !== "object") continue;
        const e = entrada as { url?: unknown; tokenRef?: unknown; token?: unknown };
        const base = baseDeServidor(String(e.url ?? ""));
        if (!base || vistos.has(base)) continue;
        if (typeof e.token === "string" && e.token.trim()) continue; // token en claro: fuera
        const tokenRef = typeof e.tokenRef === "string" ? e.tokenRef.trim() : "";
        vistos.add(base);
        lista.push(tokenRef ? { url: base, tokenRef } : { url: base });
        if (lista.length >= TOPE_SERVIDORES) break;
    }
    return lista;
}

/** Lee la lista de la malla desde un almacén (por defecto localStorage del navegador). */
export function leerServidores(almacen?: { getItem(clave: string): string | null }): ServidorMalla[] {
    let crudo: unknown = null;
    if (almacen) {
        try {
            crudo = JSON.parse(almacen.getItem(SERVIDORES_MALLA_KEY) ?? "null") as unknown;
        } catch {
            return [];
        }
    } else {
        if (typeof window === "undefined") return [];
        try {
            crudo = JSON.parse(window.localStorage.getItem(SERVIDORES_MALLA_KEY) ?? "null") as unknown;
        } catch {
            return [];
        }
    }
    return sanearServidores(crudo);
}

/** Cabecera Authorization solo si hay referencia y el resolutor da un valor. */
async function tokenDeServidor(
    servidor: ServidorMalla,
    tokenDe?: ResolverToken | null,
): Promise<string | null> {
    if (!servidor.tokenRef || !tokenDe) return null;
    try {
        const valor = await tokenDe(servidor.tokenRef);
        return valor ? `Bearer ${valor}` : null;
    } catch {
        return null; // el almacén no está abierto: se prueba sin token, el servidor dirá
    }
}

/** Opciones de la malla: red y resolutor de token inyectados (probable con fetch falso). */
export interface OpcionesMalla {
    servidores: ServidorMalla[];
    fetchImpl?: typeof fetch;
    tokenDe?: ResolverToken | null;
    signal?: AbortSignal;
    /** Calidad para imágenes (0-100), si aplica. */
    calidad?: number;
}

/** Lo que responde un conversor de la malla a «¿a qué conviertes esto?». */
export interface EstadoMalla {
    disponible: boolean;
    version: string | null;
    destinos: DestinosFormato | null;
    /** Por qué no se pudo, honesto y en español (solo cuando todo falló). */
    motivo?: string;
    /** La neurona de la malla que respondió (honestidad: se puede decir de dónde salió). */
    via?: string;
}

/** Lo que devuelve convertir en la malla: mismo resultado que la neurona local. */
export interface ConvertidoMalla {
    blob: Blob;
    nombre: string;
    salidas: number;
    motor: string;
    ms: number;
    via: string;
}

/** Pide con la cabecera de token resuelta por su nombre (nunca el valor guardado). */
async function pedir(
    servidor: ServidorMalla,
    url: string,
    inicio: RequestInit,
    opciones: OpcionesMalla,
): Promise<Response> {
    const token = await tokenDeServidor(servidor, opciones.tokenDe);
    const cabeceras = new Headers(inicio.headers);
    if (token) cabeceras.set("Authorization", token);
    return (opciones.fetchImpl ?? fetch)(url, { ...inicio, headers: cabeceras });
}

/**
 * Pregunta a cada conversor de la malla, en orden, a qué convierte un formato.
 * Devuelve el primero que responda disponible, o el estado «no disponible» con
 * un motivo honesto. `null` solo si la lista está vacía (no hay malla que probar).
 */
export async function consultarDestinosMalla(
    de: string,
    opciones: OpcionesMalla,
): Promise<EstadoMalla | null> {
    const servidores = opciones.servidores;
    if (!servidores.length) return null;
    let ultimoMotivo = "";
    for (const servidor of servidores) {
        const url = urlApi(servidor.url);
        if (!url) continue;
        try {
            const r = await pedir(servidor, url, { cache: "no-store" }, { ...opciones, servidores: [servidor] });
            if (r.ok) {
                const d = (await r.json()) as {
                    filee?: { instalado?: boolean; version?: string | null };
                    destinos?: DestinosFormato | null;
                };
                const instalado = Boolean(d.filee?.instalado);
                return {
                    disponible: instalado && Boolean(d.destinos),
                    version: d.filee?.version ?? null,
                    destinos: d.destinos ?? null,
                    via: servidor.url,
                };
            }
            ultimoMotivo = `«${servidor.url}» respondió ${r.status}.`;
        } catch {
            ultimoMotivo = `«${servidor.url}» no responde.`;
        }
    }
    return {
        disponible: false,
        version: null,
        destinos: null,
        motivo: `Ninguna de las ${servidores.length} neuronas de tu malla con conversor respondió. ${ultimoMotivo}`.trim(),
    };
}

/**
 * Manda el archivo a cada conversor de la malla, en orden, y devuelve el
 * primero que convierta. Si no hay servidores devuelve `null` (no hay malla que
 * probar) y si había y todos fallan lanza un Error honesto en español.
 */
export async function convertirEnMalla(
    archivo: Blob,
    nombre: string,
    a: string,
    opciones: OpcionesMalla,
): Promise<ConvertidoMalla | null> {
    const servidores = opciones.servidores;
    if (!servidores.length) return null;
    let ultimoMotivo = "";
    for (const servidor of servidores) {
        const url = urlApi(servidor.url);
        if (!url) continue;
        try {
            const form = new FormData();
            form.set("archivo", archivo, nombre);
            form.set("nombre", nombre);
            form.set("a", a);
            if (opciones.calidad) form.set("calidad", String(opciones.calidad));
            const r = await pedir(
                servidor,
                url,
                { method: "POST", body: form, signal: opciones.signal },
                { ...opciones, servidores: [servidor] },
            );
            if (!r.ok) {
                const cuerpo = (await r.json().catch(() => null)) as { motivo?: string } | null;
                ultimoMotivo = cuerpo?.motivo ? `«${servidor.url}»: ${cuerpo.motivo}` : `«${servidor.url}» respondió ${r.status}.`;
                continue;
            }
            const blob = await r.blob();
            const crudo = r.headers.get("X-Conversion-Nombre");
            return {
                blob,
                nombre: crudo ? decodeURIComponent(crudo) : nombre,
                salidas: Number(r.headers.get("X-Conversion-Salidas") ?? 1) || 1,
                motor: r.headers.get("X-Conversion-Motor") ?? "filee",
                ms: Number(r.headers.get("X-Conversion-Ms") ?? 0) || 0,
                via: servidor.url,
            };
        } catch {
            ultimoMotivo = `«${servidor.url}» no responde.`;
        }
    }
    throw new Error(
        `Ninguna de las ${servidores.length} neuronas de tu malla pudo convertir el archivo. ${ultimoMotivo}`.trim(),
    );
}
