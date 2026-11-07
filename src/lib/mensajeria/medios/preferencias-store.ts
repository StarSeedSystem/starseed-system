"use client";

/**
 * Preferencias de medio de transmisión — globales y por chat (MSJ1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Local al instante en este aparato (`localStorage`, clave versionada `starseed.mensajeria.medios.v1`)
 * y avisa a todas las vistas abiertas (también a otras pestañas). Cada chat guarda SOLO lo que
 * cambia; si no tiene propias, hereda las generales de Mensajería.
 *
 * Claves de chat: `dm:<hilo>`, `grupo:<hilo>`, `correo:<hilo>`, `neurona:<clave>` (ver `claveChat`).
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { normalizarPreferencias, PREFERENCIAS_POR_DEFECTO } from "./medios";
import type { PreferenciasMedio, TipoChatMedio } from "./tipos";

export const CLAVE_PREFERENCIAS_MEDIO = "starseed.mensajeria.medios.v1";
const EVENTO = "starseed:mensajeria-medios";

export interface EstadoPreferenciasMedio {
    v: 1;
    global: PreferenciasMedio;
    /** Enseñar en cada burbuja por dónde viajó el mensaje. */
    mostrarVia: boolean;
    porChat: Record<string, PreferenciasMedio>;
    /**
     * (NEU1107B) Medios preferidos de cada NEURONA (id de `neuron_devices` → preferencias): lo que sale
     * de ese aparato los usa salvo que el chat tenga los suyos. Orden: chat → neurona → generales.
     * Opcional: un estado guardado por una web anterior no lo trae.
     */
    porNeurona?: Record<string, PreferenciasMedio>;
}

export const ESTADO_INICIAL: EstadoPreferenciasMedio = {
    v: 1,
    global: { ...PREFERENCIAS_POR_DEFECTO, elegidos: [] },
    mostrarVia: true,
    porChat: {},
};

export function claveChat(tipo: TipoChatMedio, id: string): string {
    return `${tipo}:${id}`;
}

/** PURA: lee un estado guardado (o basura) y devuelve uno válido. */
export function leerEstado(crudo: string | null): EstadoPreferenciasMedio {
    if (!crudo) return ESTADO_INICIAL;
    try {
        const o = JSON.parse(crudo) as Partial<EstadoPreferenciasMedio> | null;
        if (!o || typeof o !== "object") return ESTADO_INICIAL;
        const porChat: Record<string, PreferenciasMedio> = {};
        if (o.porChat && typeof o.porChat === "object") {
            for (const [k, p] of Object.entries(o.porChat)) {
                if (typeof k === "string" && k.length <= 160) porChat[k] = normalizarPreferencias(p);
            }
        }
        const porNeurona: Record<string, PreferenciasMedio> = {};
        if (o.porNeurona && typeof o.porNeurona === "object") {
            for (const [k, p] of Object.entries(o.porNeurona)) {
                if (typeof k === "string" && k && k.length <= 80) porNeurona[k] = normalizarPreferencias(p);
            }
        }
        return {
            v: 1,
            global: normalizarPreferencias(o.global),
            mostrarVia: o.mostrarVia !== false,
            porChat,
            ...(Object.keys(porNeurona).length ? { porNeurona } : {}),
        };
    } catch {
        return ESTADO_INICIAL;
    }
}

/**
 * PURA: preferencias efectivas de un chat: las suyas; si no tiene, las de la neurona desde la que se
 * envía (NEU1107B); si tampoco, las generales.
 */
export function efectivasDe(estado: EstadoPreferenciasMedio, clave?: string | null, neurona?: string | null): PreferenciasMedio {
    if (clave && estado.porChat[clave]) return estado.porChat[clave];
    if (neurona && estado.porNeurona?.[neurona]) return estado.porNeurona[neurona];
    return estado.global;
}

/** PURA: las propias de una neurona (null = usa las generales). */
export function propiasDeNeurona(estado: EstadoPreferenciasMedio, neurona: string | null | undefined): PreferenciasMedio | null {
    return neurona ? estado.porNeurona?.[neurona] ?? null : null;
}

let cache: { crudo: string | null; estado: EstadoPreferenciasMedio } | null = null;

function leerAlmacen(): string | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage.getItem(CLAVE_PREFERENCIAS_MEDIO);
    } catch {
        return null;
    }
}

/** Instantánea estable (misma referencia mientras no cambie lo guardado). */
export function estadoPreferenciasMedio(): EstadoPreferenciasMedio {
    const crudo = leerAlmacen();
    if (cache && cache.crudo === crudo) return cache.estado;
    cache = { crudo, estado: leerEstado(crudo) };
    return cache.estado;
}

function escribir(estado: EstadoPreferenciasMedio): void {
    try {
        localStorage.setItem(CLAVE_PREFERENCIAS_MEDIO, JSON.stringify(estado));
    } catch {
        /* sin espacio o sin almacenamiento: la sesión sigue con lo que tenía */
    }
    cache = null;
    try {
        window.dispatchEvent(new Event(EVENTO));
    } catch {
        /* sin ventana (pruebas): nada que avisar */
    }
}

function suscribir(cb: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const alAlmacen = (e: StorageEvent) => {
        if (e.key === CLAVE_PREFERENCIAS_MEDIO) {
            cache = null;
            cb();
        }
    };
    window.addEventListener(EVENTO, cb);
    window.addEventListener("storage", alAlmacen);
    return () => {
        window.removeEventListener(EVENTO, cb);
        window.removeEventListener("storage", alAlmacen);
    };
}

/** Misma clave que `NEURON_DEVICE_ID_KEY` (neurons.ts): se lee sin arrastrar ese módulo ni crear nada. */
const CLAVE_ID_NEURONA = "starseed.neuron.device-id";

/** Id de la neurona de este medio (o null si aún no tiene). Nunca lanza. */
export function neuronaDeEsteMedio(): string | null {
    try {
        const id = typeof localStorage === "undefined" ? null : localStorage.getItem(CLAVE_ID_NEURONA);
        return id && id.trim() ? id.trim() : null;
    } catch {
        return null;
    }
}

/** Preferencias efectivas fuera de React (al enviar): chat → esta neurona → generales. */
export function preferenciasEfectivas(clave?: string | null): PreferenciasMedio {
    return efectivasDe(estadoPreferenciasMedio(), clave, neuronaDeEsteMedio());
}

/** (NEU1107B) Medios preferidos de una neurona. `null` = vuelve a usar los generales. */
export function cambiarPreferenciasNeurona(neurona: string, p: PreferenciasMedio | null): void {
    if (!neurona) return;
    const e = estadoPreferenciasMedio();
    const porNeurona = { ...(e.porNeurona ?? {}) };
    if (p) porNeurona[neurona] = normalizarPreferencias(p);
    else delete porNeurona[neurona];
    const { porNeurona: _antes, ...resto } = e;
    escribir(Object.keys(porNeurona).length ? { ...resto, porNeurona } : resto);
}

export function cambiarPreferenciasGlobales(p: PreferenciasMedio): void {
    const e = estadoPreferenciasMedio();
    escribir({ ...e, global: normalizarPreferencias(p) });
}

/** `null` = el chat vuelve a heredar las generales. */
export function cambiarPreferenciasChat(clave: string, p: PreferenciasMedio | null): void {
    const e = estadoPreferenciasMedio();
    const porChat = { ...e.porChat };
    if (p) porChat[clave] = normalizarPreferencias(p);
    else delete porChat[clave];
    escribir({ ...e, porChat });
}

export function cambiarMostrarVia(v: boolean): void {
    escribir({ ...estadoPreferenciasMedio(), mostrarVia: v });
}

const servidor = () => ESTADO_INICIAL;

export interface ApiPreferenciasMedio {
    estado: EstadoPreferenciasMedio;
    global: PreferenciasMedio;
    /** Las propias del chat (null = hereda). */
    propias: PreferenciasMedio | null;
    efectivas: PreferenciasMedio;
    mostrarVia: boolean;
    cambiarGlobal: (p: PreferenciasMedio) => void;
    cambiarChat: (p: PreferenciasMedio | null) => void;
    cambiarMostrarVia: (v: boolean) => void;
}

/** Hook: preferencias generales y, si se da `clave`, las de ese chat. */
export function usePreferenciasMedio(clave?: string | null): ApiPreferenciasMedio {
    const estado = useSyncExternalStore(suscribir, estadoPreferenciasMedio, servidor);
    const cambiarChat = useCallback(
        (p: PreferenciasMedio | null) => {
            if (clave) cambiarPreferenciasChat(clave, p);
        },
        [clave],
    );
    return useMemo(
        () => ({
            estado,
            global: estado.global,
            propias: clave ? estado.porChat[clave] ?? null : null,
            efectivas: efectivasDe(estado, clave, neuronaDeEsteMedio()),
            mostrarVia: estado.mostrarVia,
            cambiarGlobal: cambiarPreferenciasGlobales,
            cambiarChat,
            cambiarMostrarVia,
        }),
        [estado, clave, cambiarChat],
    );
}
