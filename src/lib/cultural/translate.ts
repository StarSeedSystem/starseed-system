"use client";

/*
 * cultural/translate — TRADUCCIÓN INLINE con el router GRATIS de Astraura.
 * ---------------------------------------------------------------------------
 * Traduce textos (tarjetas de perfiles/entidades, descripciones) usando el
 * MISMO router gratis-primero del OS (`astrauraChat`), con un system prompt de
 * traducción. Caché local por hash (safe-storage, nunca lanza) para no repetir
 * llamadas. Idioma destino = el del navegador (o el que pase el llamador).
 *
 * Sin dependencias nuevas. Defensivo: ante cualquier fallo devuelve el texto
 * original con `ok:false` (la UI muestra un aviso honesto, nunca UI muerta).
 */

import { astrauraChat } from "@/ai/astraura/router";
import { safeGet, safeSet } from "@/lib/safe-storage";

/** Nombres en español de los idiomas destino más habituales. */
const LANG_NAMES: Record<string, string> = {
    es: "español",
    en: "inglés",
    pt: "portugués",
    fr: "francés",
    de: "alemán",
    it: "italiano",
    ca: "catalán",
    gl: "gallego",
    eu: "euskera",
    ru: "ruso",
    uk: "ucraniano",
    ar: "árabe",
    zh: "chino",
    ja: "japonés",
    ko: "coreano",
    hi: "hindi",
};

/** Idioma destino por defecto: el del navegador (código base) o "es". */
export function detectTargetLang(): string {
    try {
        if (typeof navigator !== "undefined" && navigator.language) {
            return navigator.language.slice(0, 2).toLowerCase();
        }
    } catch {
        /* noop */
    }
    return "es";
}

/** Nombre legible del idioma destino. */
export function targetLangName(code: string): string {
    return LANG_NAMES[code] ?? code;
}

/* ------------------------------------------------------------------ */
/* Caché local (una sola clave JSON, acotada)                         */
/* ------------------------------------------------------------------ */

const CACHE_KEY = "starseed.cultural.translate.v1";
const CACHE_MAX = 300;

interface CacheEntry {
    t: string; // traducción
    at: number;
}
type CacheMap = Record<string, CacheEntry>;

/** Hash estable y corto (djb2) de texto+destino. */
function hashKey(text: string, target: string): string {
    const s = `${target}::${text}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return `h${(h >>> 0).toString(36)}`;
}

function readCache(): CacheMap {
    try {
        const raw = safeGet(CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === "object" ? (parsed as CacheMap) : {};
    } catch {
        return {};
    }
}

function writeCache(map: CacheMap): void {
    try {
        const keys = Object.keys(map);
        if (keys.length > CACHE_MAX) {
            // Poda: conserva las CACHE_MAX más recientes.
            const sorted = keys.sort((a, b) => (map[b]?.at ?? 0) - (map[a]?.at ?? 0)).slice(0, CACHE_MAX);
            const next: CacheMap = {};
            for (const k of sorted) next[k] = map[k];
            map = next;
        }
        safeSet(CACHE_KEY, JSON.stringify(map));
    } catch {
        /* la caché nunca debe romper una traducción */
    }
}

/** Lee una traducción cacheada (o null). */
export function getCachedTranslation(text: string, target: string): string | null {
    const map = readCache();
    return map[hashKey(text, target)]?.t ?? null;
}

/* ------------------------------------------------------------------ */
/* API pública                                                        */
/* ------------------------------------------------------------------ */

export interface TranslateOptions {
    /** Idioma destino (código base). Por defecto, el del navegador. */
    target?: string;
    /** Señal de cancelación. */
    signal?: AbortSignal;
    /** Fuerza volver a traducir aunque esté en caché. */
    noCache?: boolean;
}

export interface TranslateResult {
    ok: boolean;
    /** Texto traducido (o el original si falló). */
    text: string;
    /** true si vino de la caché local. */
    fromCache: boolean;
    /** Código del idioma destino usado. */
    target: string;
    /** Mensaje de error honesto si `ok:false`. */
    error?: string;
}

/**
 * Traduce `text` al idioma destino con el router gratis. Cachea el resultado.
 * Nunca lanza. Si falla, devuelve el original con `ok:false` y un error legible.
 */
export async function translateText(text: string, opts: TranslateOptions = {}): Promise<TranslateResult> {
    const target = (opts.target ?? detectTargetLang()).toLowerCase();
    const clean = (text ?? "").trim();

    if (!clean) {
        return { ok: false, text: text ?? "", fromCache: false, target, error: "No hay texto que traducir." };
    }

    if (!opts.noCache) {
        const cached = getCachedTranslation(clean, target);
        if (cached) {
            return { ok: true, text: cached, fromCache: true, target };
        }
    }

    const langName = targetLangName(target);
    const system =
        `Eres un traductor. Traduce el texto del usuario al ${langName}. ` +
        `Devuelve ÚNICAMENTE la traducción, sin comillas, sin notas, sin el idioma de origen. ` +
        `Si ya está en ${langName}, devuélvelo igual. Conserva el tono y el sentido.`;

    // Salvaguarda de tiempo propia (además de los timeouts internos del router).
    const controller = new AbortController();
    const timer = setTimeout(() => {
        try {
            controller.abort();
        } catch {
            /* noop */
        }
    }, 25_000);
    const signal = opts.signal ?? controller.signal;

    try {
        const res = await astrauraChat({
            messages: [
                { role: "system", content: system },
                { role: "user", content: clean },
            ],
            temperature: 0.2,
            maxTokens: 800,
            taskHint: "fast",
            signal,
        });
        const out = (res?.text ?? "").trim();
        if (!out) {
            return { ok: false, text, fromCache: false, target, error: "El traductor no devolvió texto." };
        }
        // Guardar en caché.
        const map = readCache();
        map[hashKey(clean, target)] = { t: out, at: Date.now() };
        writeCache(map);
        return { ok: true, text: out, fromCache: false, target };
    } catch (e) {
        const msg = (e as Error)?.name === "AbortError" ? "La traducción se canceló." : (e as Error)?.message || "No se pudo traducir ahora mismo.";
        return { ok: false, text, fromCache: false, target, error: msg };
    } finally {
        clearTimeout(timer);
    }
}
