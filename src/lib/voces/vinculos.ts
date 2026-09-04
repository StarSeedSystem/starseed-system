/**
 * VÍNCULOS DE VOZ (Tarea VZ5 · Ola 240 · estudio de voces)
 * ─────────────────────────────────────────────────────────────────────────────
 * Une cada PERSONALIDAD (timbre de `TIMBRES`) con la versión de voz que habla
 * por ella, y declara qué versión suena en dos superficies especiales del
 * sistema: el «Rito de bienvenida» y la «Ventana de configuración inicial».
 *
 * Cada destino puede apuntar a una versión concreta o quedar en `null`
 * (sin vínculo: se usa el comportamiento por defecto de cada superficie).
 *
 * Persistencia: localStorage, clave `starseed.voces.vinculos.v1`.
 * Reglas del área: idempotencia en las promociones, nunca se lanza una
 * excepción a la interfaz.
 */

import type { Timbre } from "@/lib/aurora/timbres";
import { fijarTimbre, guardarTimbrePropio } from "@/lib/aurora/timbres";
import {
    aplicarVersionATimbre,
    actualizarVersion,
    cargarVersiones,
    type VersionVoz,
} from "@/lib/voces/versiones";

/** Tipo de vínculo: una personalidad, el rito o la ventana de configuración. */
export type DestinoVinculo = "rito" | "configuracion";

const CLAVE = "starseed.voces.vinculos.v1";

/** Vínculos de voz del usuario, por timbre y por superficie especome. */
export interface Vinculos {
    /** Cada timbre (personalidad) → id de la versión que le da voz, o `null`. */
    porTimbre: Record<string, string | null>;
    /** Versión que suena en el rito de bienvenida, o `null` si no hay vínculo. */
    rito: string | null;
    /** Versión que suena en la ventana de configuración inicial, o `null`. */
    configuracion: string | null;
}

const VACIOS: Vinculos = {
    porTimbre: {},
    rito: null,
    configuracion: null,
};

/** Lee los vínculos guardados; nunca lanza (devuelve el valor vacío si no hay). */
export function cargarVinculos(): Vinculos {
    if (typeof window === "undefined") return { ...VACIOS, porTimbre: {} };
    try {
        const raw = window.localStorage.getItem(CLAVE);
        if (!raw) return { ...VACIOS, porTimbre: {} };
        const datos = JSON.parse(raw) as Partial<Vinculos>;
        return {
            porTimbre:
                datos.porTimbre && typeof datos.porTimbre === "object"
                    ? { ...(datos.porTimbre as Record<string, string | null>) }
                    : {},
            rito: typeof datos.rito === "string" ? datos.rito : null,
            configuracion: typeof datos.configuracion === "string" ? datos.configuracion : null,
        };
    } catch {
        return { ...VACIOS, porTimbre: {} };
    }
}

/** Persiste los vínculos. Nunca lanza. */
export function guardarVinculos(v: Vinculos): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(CLAVE, JSON.stringify(v));
    } catch { /* sin almacenamiento */ }
}

/**
 * Promueve una versión a un destino: la materializa como timbre propio, apunta
 * el vínculo y, si el destino es el rito o la configuración, la deja como timbre
 * activo del sistema. TODO es idempotente: repetir la misma promoción no duplica
 * nada ni cambia lo ya apuntado.
 *
 * Devuelve el vínculo actualizado, o `null` si la versión no existe.
 */
export function promoverVersion(
    versionId: string,
    destino: DestinoVinculo | string,
): Vinculos | null {
    if (typeof window === "undefined") return null;

    const versiones = cargarVersiones();
    const v: VersionVoz | undefined = versiones.find((x) => x.id === versionId);
    if (!v) return null;

    // 1 · La versión se convierte en un timbre propio listo para usar.
    const timbre: Timbre = aplicarVersionATimbre(v);

    // 2 · Se guarda como timbre propio (idempotente: mismo id, se sustituye).
    guardarTimbrePropio(timbre);

    // 3 · Se apunta el vínculo según el destino.
    const vinculos = cargarVinculos();
    if (destino === "rito") {
        vinculos.rito = timbre.id;
    } else if (destino === "configuracion") {
        vinculos.configuracion = timbre.id;
    } else {
        vinculos.porTimbre[destino] = timbre.id;
    }

    // 4 · Rito y configuración, además, fijan el timbre activo del sistema.
    if (destino === "rito" || destino === "configuracion") {
        fijarTimbre(timbre.id);
    }

    // 5 · Se anota el destino en `promovidaA` de la versión (sin duplicar).
    const yaAnotado = v.promovidaA.includes(destino);
    if (!yaAnotado) {
        actualizarVersion(v.id, { promovidaA: [...v.promovidaA, destino] });
    }

    guardarVinculos(vinculos);
    return vinculos;
}