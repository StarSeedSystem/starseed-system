/**
 * Avatares 3D · SINCRONÍA DEL ADN EN ESCENAS COMPARTIDAS Y XR (AV1011E).
 * Contrato: architecture/astraura-avatares-3d.md §3 (tres velocidades) y §6 (calidad en XR).
 * ============================================================================
 * Los lotes de `lote()` (`src/lib/avatares/adn/cambios.ts`) viajan por el MISMO canal de la escena
 * (`src/lib/vivo/espacial/canal.ts`) como evento «adn» con `{ ref, rev, cambios }`: quien recibe
 * filtra cada cambio con `sanearCambio` y lo aplica solo si la revisión llega más nueva. Para leer
 * el ADN de quien entra, caché UNA vez por `ref + rev`. En XR el nivel de avatar sale de la calidad
 * del aparato (`src/lib/xr/calidad-perfiles.ts`) y se recorta con `adnParaCalidad` (núcleo, §6):
 * la identidad de gesto no cambia, cambia cuánto se dibuja.
 * PURO: sin reloj, red, disco ni aleatorio; la lectura del ADN y la escena se inyectan.
 */

import { esRefInterna, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "@/lib/avatares/adn/calidad";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";

export interface EventoAdn {
    /** Referencia interna del ADN (`biblioteca:…` o `genesis:…`, nunca una URL externa suelta). */
    ref: string;
    /** Revisión del ADN del emisor DESPUÉS de aplicar el lote (gana la más alta). */
    rev: number;
    cambios: CambioAvatar[];
}

export interface EntradaAvatarXR {
    /** ADN recortado para el nivel de avatar de la calidad del aparato. */
    adn: AdnAvatar;
    presupuesto: PresupuestoAvatar;
}

const revDe = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;

/** Un evento «adn» que llega del canal → evento válido con cambios ya saneados, o `null`. */
export function sanearEventoAdn(v: unknown): EventoAdn | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const rev = revDe(o.rev);
    if (!esRefInterna(o.ref) || rev === null || !Array.isArray(o.cambios)) return null;
    const cambios = (o.cambios as unknown[]).map(sanearCambio).filter((c): c is CambioAvatar => c !== null).slice(0, 32);
    return cambios.length === 0 ? null : { ref: o.ref, rev, cambios };
}

/** Del lado de quien edita: el evento del lote (`lote()`), o `null` si no hay nada válido que viaje. */
export function eventoAdnDeLote(ref: string, rev: number, lote: readonly unknown[] | null): EventoAdn | null {
    if (!ref || !Array.isArray(lote) || lote.length === 0) return null;
    return sanearEventoAdn({ ref, rev: Math.max(0, Math.floor(rev)), cambios: lote });
}

export interface CacheAdn {
    /** ADN del ref, leído UNA vez por sesión mientras la revisión pedida no sea más nueva. */
    obtener(ref: string, rev: number): AdnAvatar | null;
    /** ¿Está ya en caché esta combinación (no vuelve a preguntar al lector)? */
    tiene(ref: string, rev: number): boolean;
}

/**
 * Caché por `ref + rev` para leer el ADN de un presente UNA vez por sesión. `leer` la inyecta el
 * cableado (almacén del aparato, Biblioteca): aquí no hay disco ni red. Una revisión más nueva
 * fuerza UNA relectura; la misma o más vieja se sirve de caché sin tocar nada.
 */
export function crearCacheAdn(leer: (ref: string) => unknown): CacheAdn {
    const cache = new Map<string, AdnAvatar>();
    return {
        obtener(ref, rev) {
            if (!esRefInterna(ref) || !Number.isFinite(rev)) return null;
            const guardado = cache.get(ref);
            if (guardado && rev <= guardado.rev) return guardado;
            const leido = sanearAdn(leer(ref));
            if (!leido) return guardado ?? null;
            cache.set(ref, leido);
            return leido;
        },
        tiene(ref, rev) {
            const guardado = cache.get(ref);
            return !!guardado && rev <= guardado.rev;
        },
    };
}

/** ¿Se aplica este evento a este ADN? Solo si es su ref y la revisión llega más nueva (§3). */
export function eventoEsAplicable(adn: AdnAvatar | null, e: EventoAdn, refEsperado?: string): boolean {
    if (!adn || e.rev <= adn.rev) return false;
    return refEsperado === undefined ? true : e.ref === refEsperado;
}

/**
 * Aplica el evento al ADN local si la revisión es más nueva: cada cambio ya viaja saneado y
 * `aplicarCambios` revalida; la revisión queda sellada en la del evento (gana la más alta) para
 * que los rev contados por cambios en ambos lados no se vayan divergiendo.
 */
export function aplicarEventoAdn(adn: AdnAvatar | null, e: EventoAdn, refEsperado?: string): AdnAvatar | null {
    if (!eventoEsAplicable(adn, e, refEsperado)) return adn;
    const aplicado = aplicarCambios(adn as AdnAvatar, e.cambios);
    return sanearAdn({ ...aplicado, rev: e.rev }) ?? aplicado;
}

/**
 * En XR el nivel de avatar sale de la calidad del aparato (`PERFILES[nivel].avatar`, src/lib/xr)
 * y el ADN se recorta con `adnParaCalidad` (núcleo §6): en el nivel más bajo eres tu orbe con tu
 * aura — la identidad de gesto no cambia, cambia cuánto se dibuja.
 */
export function adnParaNivelXR(adn: AdnAvatar, nivel: NivelCalidad): EntradaAvatarXR {
    return adnParaCalidad(adn, PERFILES[nivel].avatar);
}
