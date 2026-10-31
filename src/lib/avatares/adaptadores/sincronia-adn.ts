/**
 * Avatares 3D · SINCRONÍA DEL ADN EN ESCENAS COMPARTIDAS Y XR (AV1011E).
 * Contrato: architecture/astraura-avatares-3d.md §12 fase E y §3 (mismas velocidades).
 *
 * Cada presente anuncia en su MetaAvatar la referencia de su ADN (`biblioteca:…`/`genesis:…`)
 * con su revisión. Al entrar a alguien, los presentes leen ese ADN UNA vez por (ref, rev) —
 * sin sondeos ni peticiones en bucle. Después, la edición en vivo viaja por el MISMO canal de
 * la escena como evento «adn»: los lotes de `lote()` se convierten a `{ref, rev, cambios}`,
 * quien recibe los sanea con `sanearCambio` y aplica solo si la revisión es más nueva.
 * En XR, el nivel del avatar sale de la calidad en curso (`src/lib/xr/calidad-perfiles.ts`)
 * y se dibuja con `adnParaCalidad`.
 * PURO: la red, el reloj y la lectura real de la Biblioteca quedan a quien llama.
 */
import { esRefInterna, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambio, sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "@/lib/avatares/adn/calidad";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";

// ── Mensajes del evento «adn» del canal de la escena ──

export interface MensajeAdn {
    ref: string;
    rev: number;
    cambios: CambioAvatar[];
}

const LIMITE_CAMBIOS_MENSAJE = 48;
const esRev = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;

/** Lo que llega del canal → mensaje válido o `null`; los cambios sueltos que no se entienden se sueltan aquí. */
export function sanearMensajeAdn(v: unknown): MensajeAdn | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (!esRefInterna(o.ref) || !esRev(o.rev) || !Array.isArray(o.cambios)) return null;
    const cambios = o.cambios
        .slice(0, LIMITE_CAMBIOS_MENSAJE)
        .map(sanearCambio)
        .filter((c): c is CambioAvatar => c !== null);
    return { ref: o.ref, rev: o.rev, cambios };
}

/** Un lote devuelto por `lote()` → mensaje para el canal del evento «adn» (o `null` si nada quedó válido). */
export function mensajeDeLote(ref: string, rev: number, lista: readonly unknown[]): MensajeAdn | null {
    if (!esRefInterna(ref) || !esRev(rev) || !Array.isArray(lista)) return null;
    const cambios = lista.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    return cambios.length > 0 ? { ref, rev, cambios } : null;
}

// ── Caché de ADN por ref+rev (una lectura por par y por sesión) ──

export interface CacheAdn {
    para(ref: string, rev: number): { adn: AdnAvatar | null; pedir: boolean };
    guardar(ref: string, adn: unknown): AdnAvatar | null;
    aplicar(mensaje: unknown): AdnAvatar | null;
    refsPorPedir(presentes: readonly { adnRef?: string; adnRev?: number }[]): string[];
    conocidas(): number;
}

interface EntradaAdn {
    /** Último ADN completo que conocemos (null mientras no llegue la lectura). */
    adn: AdnAvatar | null;
    /** Revisión del ADN guardado arriba (null = nada guardado todavía). */
    revAdn: number | null;
    /** La revisión más alta que ya pedimos a la red: pedir otra vez sería sondear. */
    revPedida: number | null;
}

export function crearCacheAdn(): CacheAdn {
    const entradas = new Map<string, EntradaAdn>();

    const para = (ref: string, rev: number): { adn: AdnAvatar | null; pedir: boolean } => {
        if (!esRefInterna(ref) || !esRev(rev)) return { adn: null, pedir: false };
        let e = entradas.get(ref);
        if (!e) {
            e = { adn: null, revAdn: null, revPedida: null };
            entradas.set(ref, e);
        }
        // Una vez por (ref, rev): ya pedida la misma ni una revisión vieja; si la en vivo nos dejó
        // al día (revAdn ≥ rev), tampoco.
        const pedir = e.revPedida !== rev && (e.revAdn === null ? true : rev > e.revAdn);
        if (pedir) e.revPedida = rev;
        return { adn: e.adn, pedir };
    };

    const guardar = (ref: string, adn: unknown): AdnAvatar | null => {
        if (!esRefInterna(ref)) return null;
        const limpio = sanearAdn(adn);
        if (!limpio) return null;
        let e = entradas.get(ref);
        if (!e) {
            e = { adn: limpio, revAdn: limpio.rev, revPedida: null };
            entradas.set(ref, e);
            return limpio;
        }
        // Un ADN leído más viejo que lo que ya llegó por el canal no pisa lo más nuevo.
        if (e.revAdn === null || limpio.rev > e.revAdn) {
            e.adn = limpio;
            e.revAdn = limpio.rev;
            e.revPedida = Math.max(e.revPedida ?? 0, limpio.rev);
        }
        return limpio;
    };

    const aplicar = (mensaje: unknown): AdnAvatar | null => {
        const m = sanearMensajeAdn(mensaje);
        if (!m) return null;
        const e = entradas.get(m.ref);
        if (!e?.adn || e.revAdn === null) return null;
        if (m.rev <= e.revAdn) return e.adn; // ya está al día: nada que aplicar
        let adn = e.adn;
        for (const c of m.cambios) adn = aplicarCambio(adn, c);
        adn = { ...adn, rev: m.rev };
        const nuevo = sanearAdn(adn);
        if (!nuevo) return null;
        e.adn = nuevo;
        e.revAdn = nuevo.rev;
        return nuevo;
    };

    return {
        para,
        guardar,
        aplicar,
        refsPorPedir(presentes) {
            const out: string[] = [];
            for (const p of presentes) {
                const ref = p.adnRef;
                const rev = p.adnRev;
                if (!ref || typeof rev !== "number") continue;
                if (para(ref, rev).pedir && !out.includes(ref)) out.push(ref);
            }
            return out;
        },
        conocidas: () => entradas.size,
    };
}

/** El ADN tal como se dibuja en XR con el nivel de calidad en curso (o `null` sin ADN: orbe por defecto). */
export function adnParaNivelXr(
    adn: AdnAvatar | null,
    nivel: NivelCalidad,
): { adn: AdnAvatar; presupuesto: PresupuestoAvatar } | null {
    if (!adn) return null;
    return adnParaCalidad(adn, PERFILES[nivel].avatar);
}
