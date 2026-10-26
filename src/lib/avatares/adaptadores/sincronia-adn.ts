/**
 * Avatares 3D · SINCRONÍA DEL ADN en escenas compartidas y XR (AV1011E). Contrato:
 * architecture/astraura-avatares-3d.md §3, §6 y §12.
 *
 * El ADN no viaja entero: la presencia solo anuncia ref y revisión (MetaAvatar.adnRef/adnRev); cada
 * presente se lee UNA vez por revisión (caché), la edición en vivo viaja como evento `adn` con
 * {ref, rev, cambios} por el MISMO canal de las poses, y en XR el nivel sale de la calidad actual
 * (`src/lib/xr/`) dibujado con `adnParaCalidad`. PURO: sin reloj, red ni disco.
 */
import { esRefInterna, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "@/lib/avatares/adn/calidad";
import { PERFILES, type AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";

/** Nombre del evento de broadcast por el que viajan los lotes del ADN (el de las poses, no otro canal). */
export const EVENTO_ADN = "adn";
/** Clave de un ADN en la escena: la MISMA que en el almacén (`refDeAdn`, contrato §12: siempre su id). */
export const refDeId = (id: string): string => `biblioteca:${id}`;
/** Evento `adn` del canal de la escena: los lotes de `lote()` envueltos con su revisión. */
export interface EventoAdn { ref: string; rev: number; cambios: CambioAvatar[] }
/** Quien anuncia un ADN en la presencia (MetaAvatar lo cumple: tipado estructural, sin importar la escena). */
export interface FuenteAdn { adnRef?: string; adnRev?: number }

/** Un lote de `lote()` + la revisión del ADN tras aplicarlo → evento para el canal (solo cambios válidos). */
export function envolverEventoAdn(ref: string, rev: number, cambios: readonly CambioAvatar[]): EventoAdn | null {
    if (!esRefInterna(ref) || !Number.isInteger(rev) || rev < 0) return null;
    const cs = cambios.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    return cs.length ? { ref, rev, cambios: cs } : null;
}
/** Evento que llega por broadcast → evento válido o `null` (lo corrupto no entra nunca). */
export function sanearEventoAdn(v: unknown): EventoAdn | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.ref !== "string" || typeof o.rev !== "number" || !Array.isArray(o.cambios)) return null;
    return envolverEventoAdn(o.ref, Math.round(o.rev), o.cambios as CambioAvatar[]);
}
/** Aplica un evento sobre la base que ya tenemos: solo gana una revisión MÁS NUEVA (manda `rev`, no la hora). */
export function aplicarEventoAdn(base: AdnAvatar | null, evento: EventoAdn): AdnAvatar | null {
    if (!base || evento.rev <= base.rev || refDeId(base.id) !== evento.ref) return null;
    const cs = evento.cambios.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    return cs.length ? sanearAdn({ ...aplicarCambios(base, cs), rev: evento.rev }) : null;
}

export interface CacheAdn {
    pedir(ref: string, rev: number): boolean; // ¿hay que leerlo? (no si ya lo tenemos o está en vuelo)
    guardar(adn: AdnAvatar): void; // guarda el ADN leído y cuelga de él los eventos sin base
    obtener(ref: string): AdnAvatar | null; // el ADN más nuevo que tenemos de esa ref
    recibir(evento: EventoAdn): AdnAvatar | null; // evento del canal: aplicarlo si es más nuevo
    olvidar(ref: string): void; // suelta una lectura fallida para poder reintentarla
    tamano(): number; // ADN guardados (diagnóstico y pruebas)
}

export const TOPE_CACHE_ADN = 32;
/** Eventos que puede acumular una ref sin base todavía: si llega más, los viejos sobran. */
const TOPE_PENDIENTES = 12;
/** Caché de ADN por ref (guardando su revisión): cada presente se lee UNA vez y los eventos cuelgan de la base. */
export function crearCacheAdn(tope = TOPE_CACHE_ADN): CacheAdn {
    const adnes = new Map<string, AdnAvatar>();
    const vuelos = new Set<string>();
    const pendientes = new Map<string, EventoAdn[]>();
    const pendir = (e: EventoAdn) => {
        const cola = (pendientes.get(e.ref) ?? []).filter((x) => x.rev !== e.rev).concat(e);
        pendientes.set(e.ref, cola.sort((a, b) => a.rev - b.rev).slice(-TOPE_PENDIENTES));
    };
    return {
        pedir(ref, rev) {
            if (!esRefInterna(ref) || !Number.isInteger(rev) || rev < 0) return false;
            const actual = adnes.get(ref);
            if ((actual && actual.rev >= rev) || vuelos.has(ref)) return false;
            vuelos.add(ref); // en vuelo AQUÍ: dos llamadas seguidas leen UNA vez
            return true;
        },
        guardar(adn) {
            const limpio = sanearAdn(adn);
            if (!limpio) return;
            const ref = refDeId(limpio.id);
            const actual = adnes.get(ref);
            if (!actual || limpio.rev >= actual.rev) adnes.set(ref, limpio);
            vuelos.delete(ref);
            for (const e of pendientes.get(ref) ?? []) {
                const base = adnes.get(ref);
                const n = base ? aplicarEventoAdn(base, e) : null;
                if (n) adnes.set(ref, n);
            }
            pendientes.delete(ref);
            const viejo = adnes.keys().next().value;
            if (adnes.size > tope && viejo !== undefined && viejo !== ref) adnes.delete(viejo); // el más viejo
        },
        obtener: (ref) => adnes.get(ref) ?? null,
        recibir(evento) {
            const e = sanearEventoAdn(evento);
            if (!e) return null;
            const base = adnes.get(e.ref) ?? null;
            if (!base) { pendir(e); return null; } // sin base: pendiente hasta que llegue la lectura
            const n = aplicarEventoAdn(base, e);
            if (n) adnes.set(e.ref, n);
            return n;
        },
        olvidar: (ref) => { vuelos.delete(ref); },        tamano: () => adnes.size,
    };
}

/** Qué ADN leer al ver a los presentes: los que aún no tenemos (o rev más nueva) y no están en vuelo.
 *  Marca cada lectura en vuelo: repetir la llamada con la misma presencia da UNA lectura por ref+rev. */
export function adnPorPedir(cache: CacheAdn, presentes: readonly FuenteAdn[]): { ref: string; rev: number }[] {
    const out: { ref: string; rev: number }[] = [];
    for (const p of presentes) {
        if (!p.adnRef || typeof p.adnRev !== "number" || !Number.isInteger(p.adnRev) || p.adnRev < 0) continue;
        if (cache.pedir(p.adnRef, p.adnRev)) out.push({ ref: p.adnRef, rev: p.adnRev });
    }
    return out;
}

/** El nivel de avatar que toca dibujar para la calidad XR actual, con el ADN recortado (`adnParaCalidad`). */
export function avatarXrPara(adn: AdnAvatar, nivel: NivelCalidad): { calidad: AvatarCalidad; adn: AdnAvatar; presupuesto: PresupuestoAvatar } {
    const calidad = PERFILES[nivel].avatar;
    return { calidad, ...adnParaCalidad(adn, calidad) };
}
