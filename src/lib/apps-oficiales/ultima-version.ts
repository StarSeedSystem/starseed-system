"use client";

/**
 * Versión viva de una app oficial (cliente): el último release de su repo en GitHub.
 *
 * (2026-09-25) Alex pidió que Audiomorphic y Omnifrecuencias dentro del OS sean «las mismas
 * que las últimas versiones de sus repos oficiales». Por eso la versión y los instaladores
 * NO se escriben a mano: se leen de `api.github.com/repos/<repo>/releases/latest`.
 *
 * Por qué así:
 *   · La API de GitHub admite CORS desde el navegador, pero sin token da 60 peticiones por
 *     hora y por IP. Con una caché de 6 h en localStorage cada dispositivo pregunta, como
 *     mucho, 4 veces al día por app: nunca agota el cupo.
 *   · Si GitHub no contesta en 8 s (o contesta mal), se usa la caché aunque esté vieja y,
 *     si no hay caché, el `respaldo` medido a mano en apps-oficiales.ts. La interfaz dice
 *     de dónde salió el dato (`origen`), para no presentar un respaldo como si fuera vivo.
 *   · Si varios componentes piden lo mismo a la vez (la página y el diálogo de instalar),
 *     comparten UNA sola petición en vuelo.
 */

import { useEffect, useMemo, useState } from "react";

import {
    APPS_OFICIALES,
    instalables,
    releaseDesdeGithub,
    type AssetClasificado,
    type ReleaseOficial,
} from "./apps-oficiales";

export type OrigenVersion = "github" | "cache" | "respaldo";

export interface ResultadoVersion {
    release: ReleaseOficial;
    origen: OrigenVersion;
}

/** 6 horas: ver el cálculo del cupo de GitHub en la cabecera. */
export const CACHE_VERSION_MS = 6 * 60 * 60 * 1000;
export const TIMEOUT_VERSION_MS = 8000;

export function claveCacheVersion(appId: string): string {
    return `starseed.apps-oficiales.release.${appId}.v1`;
}

interface EntradaCache {
    guardada: number;
    release: ReleaseOficial;
}

function leerCache(appId: string): EntradaCache | null {
    try {
        if (typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(claveCacheVersion(appId));
        if (!raw) return null;
        const json = JSON.parse(raw) as Partial<EntradaCache> | null;
        if (!json || typeof json.guardada !== "number" || !json.release) return null;
        const r = json.release;
        if (typeof r.tag !== "string" || !Array.isArray(r.assets)) return null;
        return { guardada: json.guardada, release: r };
    } catch {
        return null;
    }
}

function escribirCache(appId: string, release: ReleaseOficial, ahora: number): void {
    try {
        if (typeof localStorage === "undefined") return;
        const entrada: EntradaCache = { guardada: ahora, release };
        localStorage.setItem(claveCacheVersion(appId), JSON.stringify(entrada));
    } catch {
        /* cuota llena o modo privado: la próxima vez se vuelve a preguntar */
    }
}

async function pedirAGithub(repo: string, fetchFn: typeof fetch, timeoutMs: number): Promise<ReleaseOficial | null> {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const temporizador = setTimeout(() => ctrl?.abort(), timeoutMs);
    try {
        const r = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, {
            headers: { Accept: "application/vnd.github+json" },
            signal: ctrl?.signal,
        });
        if (!r.ok) return null;
        return releaseDesdeGithub(await r.json());
    } catch {
        return null;
    } finally {
        clearTimeout(temporizador);
    }
}

export interface OpcionesVersion {
    /** Para pruebas: fetch simulado. */
    fetch?: typeof fetch;
    ahora?: number;
    timeoutMs?: number;
    /** Ignora la caché fresca y pregunta a GitHub. */
    forzar?: boolean;
}

const enVuelo = new Map<string, Promise<ResultadoVersion | null>>();

/**
 * Último release de una app oficial. null solo si el id no es de una app oficial.
 * Nunca lanza: en el peor caso devuelve el respaldo.
 */
export function obtenerUltimaVersion(appId: string, opciones: OpcionesVersion = {}): Promise<ResultadoVersion | null> {
    const app = APPS_OFICIALES[appId];
    if (!app) return Promise.resolve(null);
    const ahora = opciones.ahora ?? Date.now();
    const cache = leerCache(appId);
    if (!opciones.forzar && cache && ahora - cache.guardada < CACHE_VERSION_MS) {
        return Promise.resolve({ release: cache.release, origen: "cache" });
    }
    const ya = enVuelo.get(appId);
    if (ya) return ya;
    const fetchFn = opciones.fetch ?? (typeof fetch !== "undefined" ? fetch : null);
    const promesa = (async (): Promise<ResultadoVersion> => {
        const viva = fetchFn ? await pedirAGithub(app.repo, fetchFn, opciones.timeoutMs ?? TIMEOUT_VERSION_MS) : null;
        if (viva) {
            escribirCache(appId, viva, ahora);
            return { release: viva, origen: "github" };
        }
        // Una caché vieja sigue siendo más reciente que el respaldo escrito a mano.
        if (cache) return { release: cache.release, origen: "cache" };
        return { release: app.respaldo, origen: "respaldo" };
    })().finally(() => enVuelo.delete(appId));
    enVuelo.set(appId, promesa);
    return promesa;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «v2.0.0 · publicada el 22 sep» (sin fecha si GitHub no la dio). */
export function etiquetaVersion(release: Pick<ReleaseOficial, "tag" | "publicado">): string {
    const tag = release.tag.startsWith("v") ? release.tag : `v${release.tag}`;
    const f = release.publicado ? new Date(release.publicado) : null;
    if (!f || Number.isNaN(f.getTime())) return tag;
    return `${tag} · publicada el ${f.getUTCDate()} ${MESES_CORTOS[f.getUTCMonth()]}`;
}

export interface EstadoUltimaVersion {
    release: ReleaseOficial | null;
    instalables: AssetClasificado[];
    origen: OrigenVersion;
    cargando: boolean;
}

/**
 * Hook: arranca con el respaldo (así el primer render del servidor y del navegador
 * coinciden) y lo sustituye por la versión viva en cuanto llega.
 */
export function useUltimaVersion(appId: string): EstadoUltimaVersion {
    const app = APPS_OFICIALES[appId];
    const [estado, setEstado] = useState<{ release: ReleaseOficial | null; origen: OrigenVersion; cargando: boolean }>(() => ({
        release: app?.respaldo ?? null,
        origen: "respaldo",
        cargando: Boolean(app),
    }));

    useEffect(() => {
        if (!APPS_OFICIALES[appId]) {
            setEstado({ release: null, origen: "respaldo", cargando: false });
            return;
        }
        let vivo = true;
        void obtenerUltimaVersion(appId).then((r) => {
            if (!vivo) return;
            setEstado(r ? { release: r.release, origen: r.origen, cargando: false } : { release: null, origen: "respaldo", cargando: false });
        });
        return () => {
            vivo = false;
        };
    }, [appId]);

    const lista = useMemo(() => (estado.release ? instalables(estado.release.assets) : []), [estado.release]);
    return { release: estado.release, instalables: lista, origen: estado.origen, cargando: estado.cargando };
}
