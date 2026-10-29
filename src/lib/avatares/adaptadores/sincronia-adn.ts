/**
 * Avatares 3D · SINCRONÍA DEL AVATAR EN ESCENAS COMPARTIDAS Y XR (AV1011E).
 * Contrato: architecture/astraura-avatares-3d.md §2, §3 y §6.
 * ----------------------------------------------------------------------------
 * Cómo recorre el ADN la escena:
 *   · al entrar alguien, los presentes leen su ADN UNA vez (caché por `ref`+`rev`);
 *   · los lotes de `lote()` (adn/cambios.ts) viajan por el MISMO canal de la escena
 *     como evento `adn` con `{ ref, rev, cambios }`;
 *   · quien recibe filtra con `sanearCambio` y aplica solo si la revisión (rev) es
 *     más nueva que la suya;
 *   · en XR el nivel del avatar sale de la calidad actual (src/lib/xr/) y se dibuja
 *     con `adnParaCalidad` (adn/calidad.ts).
 * PURO: la lectura de red/almacén se INYECTA (`leer`); sin `node:*`, sin sondeos.
 */

import { esRefInterna, sanearAdn, type AdnAvatar } from "../adn/adn";
import { aplicarCambios, sanearCambio, type CambioAvatar } from "../adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "../adn/calidad";
import { PERFILES, type AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";

/* ── Referencias y eventos ─────────────────────────────────────────────── */
/** Referencia válida de ADN para un avatar: un id de almacén (`adn-…`) o un ref interno (§2). */
export function esRefAdn(v: unknown): v is string {
    if (typeof v !== "string") return false;
    return v.startsWith("adn-") ? /^adn-[\w-]{1,80}$/.test(v) : esRefInterna(v);
}

export interface EventoAdn { ref: string; rev: number; cambios: CambioAvatar[] }
export function sanearEventoAdn(v: unknown): EventoAdn | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (!esRefAdn(o.ref)) return null;
    const rev = typeof o.rev === "number" && Number.isFinite(o.rev) ? Math.floor(o.rev) : -1;
    if (rev < 0 || !Array.isArray(o.cambios)) return null;
    const cambios = o.cambios.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    return { ref: o.ref, rev, cambios };
}

/** Evento `adn` que sale por el canal de la escena con un lote de `lote()`. `null` si no lleva nada. */
export function emisionAdn(ref: string, rev: number, cambios: readonly CambioAvatar[]): EventoAdn | null {
    if (!esRefAdn(ref) || !(typeof rev === "number" && Number.isFinite(rev)) || cambios.length === 0) return null;
    return { ref, rev: Math.max(0, Math.floor(rev)), cambios: [...cambios] };
}

/** Aplica un evento ajeno SOLO si su revisión es más nueva que la mía. El viejo sigue con su rev. */
export function aplicarEventoAdn(adn: AdnAvatar, ev: unknown): AdnAvatar {
    const e = sanearEventoAdn(ev);
    if (!e || e.ref !== adn.id || e.rev <= adn.rev) return adn;
    const siguiente = aplicarCambios(adn, e.cambios);
    // El punto de sincronía manda: la rev queda donde la clavó quien mandó el lote.
    return { ...siguiente, rev: Math.max(siguiente.rev, e.rev) };
}

/* ── Caché de lectura (una vez por ref y revisión) ─────────────────────── */

export interface CacheAdn {
    /** ADN refrescado y saneado para (`ref`, `rev`): se lee UNA vez, o reserva de orbe si no llegó. */
    obtener(ref: string, rev: number): Promise<AdnAvatar>;
    /** ¿Ya está guardado ese ref con esa revisión? */
    tiene(ref: string, rev: number): boolean;
    /** Cuántas entradas tiene (diagnóstico y pruebas). */
    tamano(): number;
}

/**
 * Caché por `ref`+`rev`: al entrar alguien se lee su ADN UNA vez, aunque lo pidan todos
 * los presentes a la vez (peticiones iguales en vuelo comparten lectura). Un ADN que no
 * pasa `sanearAdn` no se cachea; un ref que falla tampoco (se puede reintentar más tarde).
 * Tope de entradas: lo viejo sale en el orden que llegó (FIFO, sin sorpresas).
 */
export function crearCacheAdn(leer: (ref: string) => Promise<unknown> | unknown, tope = 48): CacheAdn {
    const guardadas = new Map<string, AdnAvatar>(); // «ref@rev» → ADN (caché por ref Y revisión)
    const porRef = new Map<string, AdnAvatar>(); // ref → lo más nuevo leído de ese ref
    const enVuelo = new Map<string, Promise<AdnAvatar | null>>(); // ref → lectura compartida

    const guardar = (adn: AdnAvatar): void => {
        guardadas.set(clave(adn.id, adn.rev), adn);
        const antes = porRef.get(adn.id);
        if (!antes || antes.rev < adn.rev) porRef.set(adn.id, adn);
        while (guardadas.size > tope) {
            const primera = guardadas.keys().next().value;
            if (primera === undefined) break;
            guardadas.delete(primera);
        }
        if (porRef.size > tope) porRef.delete(porRef.keys().next().value as string);
    };

    const leerRef = (ref: string): Promise<AdnAvatar | null> => {
        const abierta = enVuelo.get(ref);
        if (abierta) return abierta;
        const p = Promise.resolve()
            .then(() => leer(ref))
            .then((bruto: unknown): AdnAvatar | null => {
                enVuelo.delete(ref);
                const adn = typeof bruto === "object" && bruto !== null ? sanearAdn(bruto) : null;
                if (!adn) return null; // lo que no se puede salvar no se cachea (se podrá reintentar)
                guardar(adn);
                return adn;
            })
            .catch(() => {
                enVuelo.delete(ref); // la lectura falló: no se cachea, y nadie se queda sin avatar
                return null;
            });
        enVuelo.set(ref, p);
        return p;
    };

    const obtener = (ref: string, rev: number): Promise<AdnAvatar> => {
        const c = clave(ref, rev);
        const ya = guardadas.get(c);
        if (ya) return Promise.resolve(ya);
        const ultima = porRef.get(ref);
        // Ya leído y al día (su rev decide, no la meta): nada de releer.
        if (ultima && ultima.rev >= rev) return Promise.resolve(ultima);
        return leerRef(ref).then((adn) => {
            const tras = guardadas.get(c);
            if (tras) return tras;
            if (adn && adn.id === ref) return adn;
            return porRef.get(ref) ?? adnReserva(ref, rev);
        });
    };

    return {
        obtener,
        tiene: (ref, rev) => guardadas.has(clave(ref, rev)),
        tamano: () => guardadas.size,
    };
}

const clave = (ref: string, rev: number): string => `${ref}@${Math.max(0, Math.floor(rev))}`;

/** Los presentes nunca se quedan sin nada que dibujar: mientras el ADN no llega, orbe. */
function adnReserva(ref: string, rev: number): AdnAvatar {
    const reserva: AdnAvatar = {
        v: 1, id: ref.slice(0, 80), nombre: "Persona", dueno: { tipo: "perfil", id: "sincronia" },
        base: { tipo: "orbe" }, esqueleto: { tipo: "ninguno", articulaciones: 0 }, morfologia: {}, materiales: {},
        piezas: [], expresionBase: {}, aura: { tono: 260, intensidad: 0.6, ligadaEmocion: true },
        movimiento: { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 }, visibilidad: "privado",
        procedencia: [], rev,
    };
    return reserva;
}

/* ── XR: nivel del avatar según la calidad actual ──────────────────────── */

/** El nivel de avatar de XR sale del perfil de calidad en vigor (src/lib/xr/calidad-perfiles.ts). */
export function calidadAvatarDe(nivel: NivelCalidad): AvatarCalidad {
    return PERFILES[nivel].avatar;
}

/** El ADN se dibuja ya recortado para la calidad en vigor (`adnParaCalidad`, §6). */
export function adnXR(nivel: NivelCalidad, adn: AdnAvatar): { adn: AdnAvatar; presupuesto: PresupuestoAvatar } {
    return adnParaCalidad(adn, calidadAvatarDe(nivel));
}
