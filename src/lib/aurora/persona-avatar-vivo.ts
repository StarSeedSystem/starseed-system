"use client";

/**
 * AVATAR VIVO POR PERSONALIDAD (Ola 235 · M4)
 * ============================================================================
 * Cada personalidad de Aurora/Astraura puede tener, OPCIONALMENTE, un avatar
 * con movimiento automático y un acompañante flotante en pantalla mientras se
 * charla con ella.
 *
 * NO duplica el motor: solo guarda la CONFIGURACIÓN. El avatar se pinta con
 * `AvatarVivo` y se mueve con el motor único «Vida StarSeed» (`moverAvatar`),
 * así que la identidad del gesto es la misma en todos los equipos y el nivel
 * (vivo/fluido/ligero/quieto) lo adapta el hardware.
 *
 * Persistencia:
 *   · local  → localStorage `starseed.avatares.personalidad.v1`
 *   · espejo → `user_settings.prefs` vía `mergeUserPrefs` (puerta única,
 *              best-effort; nunca bloquea y nunca pisa claves ajenas).
 *
 * Cambios: emite `starseed:avatar-personalidad` para que el acompañante y
 * cualquier panel reaccionen al momento.
 */

import {
    getPersonalityProfile,
    type PersonalityProfile,
} from "@/lib/aurora/personalities";
import type { NivelMovimiento } from "@/lib/avatares/movimiento/niveles";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

/** Clave de persistencia local (y del espejo en prefs). */
export const AVATARES_PERSONALIDAD_KEY = "starseed.avatares.personalidad.v1";

/** Evento del bus del OS que anuncia un cambio de avatar de personalidad. */
export const AVATAR_PERSONALIDAD_EVENT = "starseed:avatar-personalidad";

export type FuenteAvatarPersonalidad = {
    tipo: "glb" | "imagen" | "procedural";
    /** URL pública cuando el tipo es «glb» o «imagen»; el procedural no la usa. */
    url?: string;
};

export type EsquinaAcompanante =
    | "inferior-derecha"
    | "inferior-izquierda"
    | "superior-derecha"
    | "superior-izquierda";

export interface AvatarPersonalidad {
    personalidadId: string;
    fuente: FuenteAvatarPersonalidad;
    movimiento: {
        /** Movimiento automático (respiración/vida) sin necesidad de gesto. */
        automatico: boolean;
        /** 0–1: amplitud/ritmo de la generación. */
        energia: number;
        /** 0–1: cuánto acentúa las expresiones. */
        expresividad: number;
        /** Nivel del motor; «auto» = el hardware decide. */
        nivel?: NivelMovimiento | "auto";
    };
    acompanante: {
        /** Mostrar el avatar en pantalla mientras esta personalidad está activa. */
        mostrar: boolean;
        esquina: EsquinaAcompanante;
        /** Tamaño en píxeles (lado del avatar). */
        tamano: number;
        /** 0–1. */
        opacidad: number;
    };
}

type Mapa = Record<string, AvatarPersonalidad>;

/* ────────────────────────────── Utilidades ────────────────────────────── */

function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

const ESQUINAS: EsquinaAcompanante[] = [
    "inferior-derecha",
    "inferior-izquierda",
    "superior-derecha",
    "superior-izquierda",
];

const NIVELES: Array<NivelMovimiento | "auto"> = ["auto", "vivo", "fluido", "ligero", "quieto"];

/** Configuración por defecto: avatar procedural, movimiento automático, sin acompañante. */
export function avatarPersonalidadPorDefecto(personalidadId: string): AvatarPersonalidad {
    return {
        personalidadId,
        fuente: { tipo: "procedural" },
        movimiento: { automatico: true, energia: 0.5, expresividad: 0.5, nivel: "auto" },
        acompanante: { mostrar: false, esquina: "inferior-derecha", tamano: 96, opacidad: 1 },
    };
}

/** Sanea lo que venga del almacenamiento: nunca confíes en disco. */
function normalizar(crudo: unknown): AvatarPersonalidad | null {
    if (!crudo || typeof crudo !== "object") return null;
    const a = crudo as Partial<AvatarPersonalidad>;
    if (typeof a.personalidadId !== "string" || !a.personalidadId) return null;
    const base = avatarPersonalidadPorDefecto(a.personalidadId);
    const f = a.fuente as Partial<FuenteAvatarPersonalidad> | undefined;
    if (f && (f.tipo === "glb" || f.tipo === "imagen" || f.tipo === "procedural")) {
        base.fuente = {
            tipo: f.tipo,
            url: typeof f.url === "string" && f.url ? f.url : undefined,
        };
        if ((f.tipo === "glb" || f.tipo === "imagen") && !base.fuente.url) {
            base.fuente = { tipo: "procedural" };
        }
    }
    const m = a.movimiento;
    if (m) {
        base.movimiento = {
            automatico: typeof m.automatico === "boolean" ? m.automatico : true,
            energia: clamp(Number(m.energia ?? 0.5) || 0, 0, 1),
            expresividad: clamp(Number(m.expresividad ?? 0.5) || 0, 0, 1),
            nivel: NIVELES.includes(m.nivel as NivelMovimiento | "auto")
                ? (m.nivel as NivelMovimiento | "auto")
                : "auto",
        };
    }
    const c = a.acompanante;
    if (c) {
        base.acompanante = {
            mostrar: typeof c.mostrar === "boolean" ? c.mostrar : false,
            esquina: ESQUINAS.includes(c.esquina as EsquinaAcompanante)
                ? (c.esquina as EsquinaAcompanante)
                : "inferior-derecha",
            tamano: clamp(Math.round(Number(c.tamano ?? 96) || 96), 56, 320),
            opacidad: clamp(Number(c.opacidad ?? 1) || 0, 0.2, 1),
        };
    }
    return base;
}

function leerMapa(): Mapa {
    if (typeof window === "undefined") return {};
    try {
        const crudo = window.localStorage.getItem(AVATARES_PERSONALIDAD_KEY);
        if (!crudo) return {};
        const json = JSON.parse(crudo) as Record<string, unknown>;
        const mapa: Mapa = {};
        for (const [id, valor] of Object.entries(json)) {
            const norm = normalizar(valor);
            if (norm) mapa[id] = norm;
        }
        return mapa;
    } catch {
        return {};
    }
}

function escribirMapa(mapa: Mapa): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(AVATARES_PERSONALIDAD_KEY, JSON.stringify(mapa));
    } catch { /* sin almacenamiento */ }
}

function emitirCambio(personalidadId: string): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(
            new CustomEvent(AVATAR_PERSONALIDAD_EVENT, { detail: { personalidadId } }),
        );
    } catch { /* noop */ }
}

/** Espejo en la cuenta soberana (best-effort, fire-and-forget, nunca lanza). */
function espejo(mapa: Mapa): void {
    void mergeUserPrefs({ [AVATARES_PERSONALIDAD_KEY]: mapa }).catch(() => undefined);
}

/* ────────────────────────────── API pública ───────────────────────────── */

/**
 * Configuración de avatar de una personalidad. Si nunca se guardó, devuelve
 * la configuración por defecto (procedural + movimiento automático).
 */
export function avatarDePersonalidad(personalidadId: string): AvatarPersonalidad {
    const mapa = leerMapa();
    return mapa[personalidadId] ?? avatarPersonalidadPorDefecto(personalidadId);
}

/**
 * Guarda la configuración (local + espejo en la cuenta) y emite
 * `starseed:avatar-personalidad`. Nunca lanza.
 */
export function guardarAvatarPersonalidad(a: AvatarPersonalidad): void {
    const norm = normalizar(a);
    if (!norm) return;
    const mapa = leerMapa();
    mapa[norm.personalidadId] = norm;
    escribirMapa(mapa);
    espejo(mapa);
    emitirCambio(norm.personalidadId);
}

/**
 * Vuelve a la configuración por defecto de esa personalidad (borra lo
 * guardado, emite el evento y actualiza el espejo). Nunca lanza.
 */
export function restablecerAvatarPersonalidad(personalidadId: string): void {
    const mapa = leerMapa();
    if (mapa[personalidadId]) {
        delete mapa[personalidadId];
        escribirMapa(mapa);
        espejo(mapa);
    }
    emitirCambio(personalidadId);
}

/** Perfil + configuración resueltos para pintar el avatar, o `null` si la personalidad no existe. */
export function avatarResolvableDe(
    personalidadId: string,
): { perfil: PersonalityProfile; config: AvatarPersonalidad } | null {
    const perfil = getPersonalityProfile(personalidadId);
    if (!perfil) return null;
    return { perfil, config: avatarDePersonalidad(personalidadId) };
}
