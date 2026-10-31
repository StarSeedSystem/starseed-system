/**
 * Avatares 3D · SINCRONÍA DEL ADN EN ESCENAS COMPARTIDAS Y XR (AV1011E).
 * ============================================================================
 * Contrato: architecture/astraura-avatares-3d.md §3 (presupuesto de tráfico) y §6 (calidad).
 *
 * · Quien entra ve el ADN de cada presente: la gente lo declara en su presencia
 *   (`adnRef` + `adnRev`) y los demás lo leen UNA vez por ref+rev (caché).
 * · Edición en vivo: los lotes de `lote()` (cambios.ts) viajan por el MISMO canal de la
 *   escena como evento `adn` con `{ ref, rev, cambios }`. Quien recibe filtra con
 *   `sanearCambio` y aplica solo si la revisión es más nueva.
 * · En XR el nivel de avatar sale de la calidad actual: `PERFILES[nivel].avatar` y
 *   `adnParaCalidad` recortan el ADN sin cambiar la identidad.
 *
 * PURO: sin reloj, red ni disco.
 */
import { esRefInterna, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambio, sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "@/lib/avatares/adn/calidad";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { avataresDePresencia, type MetaAvatar } from "@/lib/vivo/espacial/avatares";
import type { NivelCalidad } from "@/lib/xr/tipos";

export const EVENTO_ADN = "adn";

export interface EventoAdn {
    /** Referencia del ADN que cambia (por ejemplo `biblioteca:adn-…`). */
    ref: string;
    /** Revisión del ADN DESPUÉS de aplicar el lote (gana la más alta en toda la sala). */
    rev: number;
    cambios: CambioAvatar[];
}

export interface LecturaAdn {
    ref: string;
    /** Revisión que la presencia declara, o `null` si no la dijo (se lee igual una vez). */
    rev: number | null;
}

/* ── Caché de ADN por ref+rev: cada ADN se lee UNA vez por revisión ───────── */

const claveCache = (l: LecturaAdn): string => `${l.ref}@${l.rev ?? ""}`;

export type CacheAdn = Set<string>;

/** Caché nueva y vacía. */
export const crearCacheAdn = (): CacheAdn => new Set();

/** Anota que ya se (intentó) leer esa ref con esa revisión: no se vuelve a pedir salvo rev nueva. */
export function anotarLectura(cache: CacheAdn, l: LecturaAdn): void {
    cache.add(claveCache(l));
}

/** Avatares de la sala cuyo (ref, rev) aún no está en la caché: estos toca leerlos. No muta: llama a `anotarLectura` cuando la lectura salió bien. */
export function lecturasPendientes(cache: CacheAdn, presentes: readonly MetaAvatar[]): LecturaAdn[] {
    const out: LecturaAdn[] = [];
    for (const a of presentes) {
        if (!a.adnRef) continue;
        const l: LecturaAdn = { ref: a.adnRef, rev: a.adnRev ?? null };
        if (!cache.has(claveCache(l))) out.push(l);
    }
    return out;
}

/**
 * Presencia de Supabase → lectura del ADN de cada presente nuevo, una vez por ref+rev.
 */
export function lecturasDePresencia(cache: CacheAdn, estado: Record<string, unknown>, miClave: string): LecturaAdn[] {
    return lecturasPendientes(cache, avataresDePresencia(estado, miClave));
}

/* ── Evento `adn` del canal de la escena ─────────────────────────────────── */

/** Payload del canal → evento válido o `null`; los cambios que no se entienden se descartan uno a uno. */
export function sanearEventoAdn(v: unknown): EventoAdn | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (!esRefInterna(o.ref)) return null;
    if (typeof o.rev !== "number" || !Number.isFinite(o.rev) || o.rev < 0 || o.rev > 1e9) return null;
    if (!Array.isArray(o.cambios)) return null;
    const cambios = o.cambios.map(sanearCambio).filter((c): c is CambioAvatar => c !== null).slice(0, 64);
    return cambios.length ? { ref: o.ref, rev: Math.floor(o.rev), cambios } : null;
}

/** La única condición para tocar el ADN propio con un lote de fuera: que su revisión sea más nueva. */
export const esRevisionMasNueva = (tengoRev: number, eventoRev: number): boolean => eventoRev > tengoRev;

/**
 * Aplica el lote recibido a mi copia del ADN; `null` si la revisión no es más nueva o nada cambió.
 * La revisión final es la del evento: converge en toda la sala aunque un cambio no sobreviva al saneo.
 */
export function aplicarEventoAdn(adn: AdnAvatar, e: EventoAdn): AdnAvatar | null {
    if (!esRevisionMasNueva(adn.rev, e.rev)) return null;
    let actual = adn;
    for (const c of e.cambios) {
        const r = aplicarCambio(actual, c);
        if (r !== actual) actual = r;
    }
    return actual === adn ? null : { ...actual, rev: e.rev };
}

/** Lote de `lote()` → evento listo para el canal (`null` si la ref no es interna o no queda cambio limpio). */
export function eventoAdnDeLote(ref: string, adnTrasElLote: AdnAvatar, cambios: readonly CambioAvatar[]): EventoAdn | null {
    if (!esRefInterna(ref) || cambios.length === 0) return null;
    const limpios = cambios.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    return limpios.length ? { ref, rev: adnTrasElLote.rev, cambios: limpios } : null;
}

/* ── XR: el nivel de avatar sale de la calidad actual del visor ──────────── */

/** El MISMO ADN, dibujado según la calidad: `PERFILES[n].avatar` da el nivel y `adnParaCalidad` recorta. */
export function adnParaXR(adn: AdnAvatar, nivel: NivelCalidad): { adn: AdnAvatar; presupuesto: PresupuestoAvatar } {
    return adnParaCalidad(adn, PERFILES[nivel].avatar);
}
