/**
 * Avatares 3D · SINCRONÍA DEL ADN EN ESCENAS COMPARTIDAS Y XR (AV1011E).
 * Contrato: architecture/astraura-avatares-3d.md §3 y §6.
 *
 * Un mismo ADN viste a la orbe de un bot, al avatar de una persona, grupo o página (§2). En una
 * escena compartida:
 *   · quien entra (o anuncia un ref nuevo) dispara UNA lectura del ADN por `ref` + `rev` por
 *     sesión, con caché local: nada de peticiones en bucle (presupuesto del §3);
 *   · la edición en vivo viaja por el MISMO canal de la escena con el evento `adn`:
 *     `{ ref, rev, cambios }` con los lotes de `lote()` (cambios.ts), al ritmo de las poses
 *     (10 Hz, 6,7 Hz con 4–7 presentes, 4 Hz con 8 o más) y nunca si no hay nadie mirando;
 *   · quien recibe limpia los cambios con `sanearCambio` y los aplica SOLO si la revisión es
 *     más nueva que la de su copia (empate: la copia local vale);
 *   · en XR el nivel de avatar sale de la calidad actual (`src/lib/xr/calidad-perfiles.ts`) y
 *     el recorte lo hace `adnParaCalidad` (§6): misma identidad, cambia cuánto se dibuja.
 * PURO: sin red, sin disco, sin reloj propio.
 */
import { esRefInterna, sanearAdn, type AdnAvatar } from "../adn/adn";
import { aplicarCambios, sanearCambio, type CambioAvatar } from "../adn/cambios";
import { PRESUPUESTO_POR_CALIDAD, adnParaCalidad, type PresupuestoAvatar } from "../adn/calidad";
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";

/** Nombre del evento en el canal de la escena (mismo canal que las poses). */
export const EVENTO_ADN = "adn" as const;

/** Caché por referencia: una entrada por ADN, siempre la revisión más nueva vista. */
export interface EntradaAdn {
    rev: number;
    adn: AdnAvatar;
}

interface SincroniaAdnInterna {
    cache: Map<string, EntradaAdn>;
    /** `ref@rev` ya pedidos en esta sesión: cada pareja se lee UNA vez. */
    pedidas: Set<string>;
}

export type SincroniaAdn = SincroniaAdnInterna;

/** Lo que una meta de presencia necesita declarar (opcional: quien no lleva ADN no pide nada). */
export interface AdnDePresente {
    adnRef?: string | null;
    adnRev?: number | null;
}

export function crearSincroniaAdn(): SincroniaAdn {
    return { cache: new Map(), pedidas: new Set() };
}

const clavePedida = (ref: string, rev: number): string => `${ref}@${rev}`;

export const adnEnCache = (s: SincroniaAdn, ref: string): AdnAvatar | null => s.cache.get(ref)?.adn ?? null;

/** Guarda un ADN leído (de la Biblioteca o del almacén) bajo `biblioteca:<id>`. */
export function cargarAdn(s: SincroniaAdn, adnLeido: AdnAvatar): boolean {
    const adn = sanearAdn(adnLeido);
    if (!adn) return false;
    const ref = `biblioteca:${adn.id}`;
    const previa = s.cache.get(ref);
    if (previa && previa.rev >= adn.rev) return false;
    s.cache.set(ref, { rev: adn.rev, adn });
    return true;
}

/**
 * Qué ADN hay que leer por los presentes. Marca cada `ref@rev` como pedido al devolverlo: UNA
 * lectura por pareja y sesión. Si la caché ya tiene esa revisión (o más nueva), no se pide.
 */
export function refsPorLeer(s: SincroniaAdn, presentes: readonly AdnDePresente[]): { ref: string; rev: number }[] {
    const out: { ref: string; rev: number }[] = [];
    for (const a of presentes) {
        if (!a.adnRef || typeof a.adnRev !== "number" || !Number.isFinite(a.adnRev) || a.adnRev < 0) continue;
        const rev = Math.floor(a.adnRev);
        const entrada = s.cache.get(a.adnRef);
        if (s.pedidas.has(clavePedida(a.adnRef, rev)) || (entrada && entrada.rev >= rev)) continue;
        s.pedidas.add(clavePedida(a.adnRef, rev));
        out.push({ ref: a.adnRef, rev });
    }
    return out;
}

/** Payload del evento `adn` en el canal: lotes de `lote()` ya saneados (lo inválido no viaja). */
export function payloadEventoAdn(ref: unknown, rev: unknown, cambiosEnviados: readonly unknown[]): { ref: string; rev: number; cambios: CambioAvatar[] } | null {
    if (!esRefInterna(ref)) return null;
    if (typeof rev !== "number" || !Number.isFinite(rev) || rev < 0) return null;
    const cambios: CambioAvatar[] = [];
    for (const c of Array.isArray(cambiosEnviados) ? cambiosEnviados : []) {
        const ok = sanearCambio(c);
        if (ok) cambios.push(ok);
    }
    if (cambios.length === 0) return null;
    return { ref: ref as string, rev: Math.floor(rev), cambios };
}

/** Resultado de aplicar un evento `adn`: el ADN de ese ref, ya con la revisión nueva. */
export interface AdnActualizado {
    ref: string;
    rev: number;
    adn: AdnAvatar;
}

/**
 * Un evento `adn` que llegó por el canal → cambios aplicados a la copia en caché del ADN de ese
 * ref, o `null` si no hay copia, la revisión llega vieja (o igual: la copia local vale) o el
 * payload es basura. Los cambios se limpian con `sanearCambio` antes de aplicar (nunca mutan).
 */
export function aplicarEventoAdn(s: SincroniaAdn, v: unknown): AdnActualizado | null {
    if (!v || typeof v !== "object") return null;
    const p = v as Record<string, unknown>;
    if (!esRefInterna(p.ref)) return null;
    if (typeof p.rev !== "number" || !Number.isFinite(p.rev) || p.rev < 0) return null;
    const rev = Math.floor(p.rev);
    const entrada = s.cache.get(p.ref);
    if (!entrada || rev <= entrada.rev) return null;
    const cambios = (Array.isArray(p.cambios) ? p.cambios : []).map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    const adn = sanearAdn({ ...aplicarCambios(entrada.adn, cambios), rev });
    if (!adn) return null;
    s.cache.set(p.ref, { rev, adn });
    return { ref: p.ref, rev, adn };
}

/* ─────── XR (§6): el nivel sale de la calidad actual, el recorte de `adnParaCalidad` ─────── */

export interface AvatarXR {
    /** «orbe» = se dibuja su orbe con el aura del ADN (o la orbe de siempre si aún no hay ADN). */
    forma: "orbe" | "malla";
    /** ADN ya recortado al presupuesto del nivel; `null` = sin ADN: orbe por defecto. */
    adn: AdnAvatar | null;
    presupuesto: PresupuestoAvatar;
}

/** Qué se dibuja en XR de un avatar con la calidad actual de la sesión. */
export function avatarParaXR(adn: AdnAvatar | null | undefined, calidad: AvatarCalidad): AvatarXR {
    const presupuesto = PRESUPUESTO_POR_CALIDAD[calidad];
    if (!adn) return { forma: "orbe", adn: null, presupuesto };
    const recorte = adnParaCalidad(adn, calidad);
    return { forma: recorte.presupuesto.forma, adn: recorte.adn, presupuesto: recorte.presupuesto };
}
