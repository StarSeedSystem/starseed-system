/**
 * Avatares 3D · SINCRONÍA DEL ADN en escenas compartidas y XR (AV1011E). Contrato: astraura-avatares-3d.md §2/§3/§6.
 * Por el MISMO canal de la escena (evento `adn`) viaja el ADN: los presentes leen UNA vez el ADN de quien entra
 * (caché por ref+rev), la edición en vivo manda lotes de `lote()` como `{ref, rev, cambios}`, y quien recibe
 * sanea con `sanearCambio` y aplica SOLO si la revisión del mensaje es más nueva; en XR el nivel sale de la
 * calidad actual (`src/lib/xr/`) y se dibuja con `adnParaCalidad`. PURO: lectura del almacén y aviso, inyectados.
 */
import { esRefInterna, sanearAdn, type AdnAvatar } from "../adn/adn";
import { aplicarCambios, sanearCambio, type CambioAvatar } from "../adn/cambios";
import { adnParaCalidad, type PresupuestoAvatar } from "../adn/calidad";
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";
export const EVENTO_ADN = "adn";
/** Tope de cambios por lote (los lotes de `lote()` ya vienen agrupados por clave, a 10 Hz como máximo). */
export const MAX_CAMBIOS_LOTE = 32;

/** Quien declara su ADN al entrar (MetaAvatar de la escena pasa tal cual). */
export interface PresenciaConAdn { adnRef?: string; adnRev?: number }
export interface EventoAdn { ref: string; rev: number; cambios: readonly CambioAvatar[] }
export interface RecorteXR { adn: AdnAvatar; presupuesto: PresupuestoAvatar }
const revDe = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

function construirEvento(ref: string, rev: number, cs: readonly unknown[]): EventoAdn | null {
    if (!esRefInterna(ref)) return null;
    const cambios = cs.slice(0, MAX_CAMBIOS_LOTE).flatMap((c) => sanearCambio(c) ?? []);
    return cambios.length === 0 ? null : { ref, rev, cambios };
}
/** Mensaje del canal → evento válido, o `null` (ref externa, rev rara, sin cambios válidos). */
export function sanearEventoAdn(v: unknown): EventoAdn | null {
    const m = v as Record<string, unknown> | null;
    if (!m || typeof m.ref !== "string" || !Array.isArray(m.cambios)) return null;
    const rev = revDe(m.rev);
    return rev === null ? null : construirEvento(m.ref, rev, m.cambios);
}
/** Lote de `lote()` → mensaje listo para el canal (o `null` si no toca emitir nada). */
export function prepararEventoAdn(ref: string, rev: number, lote: readonly CambioAvatar[] | null): EventoAdn | null {
    const rrev = revDe(rev);
    return !ref || rrev === null || !lote || lote.length === 0 ? null : construirEvento(ref, rrev, lote);
}
/** Cambios de un mensaje aplicados a un ADN local, SOLO si la revisión del mensaje es más nueva. */
export function aplicarEventoAdn(base: AdnAvatar, e: EventoAdn): AdnAvatar | null {
    if (e.ref !== base.id || e.rev <= base.rev) return null;
    const aplicado = aplicarCambios(base, e.cambios);
    // Nada cambió de verdad (lote que no cabió en el ADN): manda la revisión ya conocida.
    if (aplicado.rev === base.rev) return null;
    return sanearAdn({ ...aplicado, rev: e.rev });
}
// pedida: revisión más alta ya pedida al almacén (caché por ref+rev: UNA sola lectura).
interface EstadoRef { ref: string; pedida: number; rev: number; adn: AdnAvatar | null; pendiente: EventoAdn | null }
function aplicarYAvisar(es: EstadoRef, e: EventoAdn, avisa: OpcionesSincroniaAdn["alCambiar"]): boolean {
    if (!es.adn) return false;
    const nuevo = aplicarEventoAdn(es.adn, e);
    if (!nuevo || nuevo.rev <= es.rev) return false;
    es.adn = nuevo;
    es.rev = nuevo.rev;
    avisa?.(es.ref, nuevo);
    return true;
}

export interface OpcionesSincroniaAdn {
    /** Lectura del almacén local, inyectada (`loadAdnEntry`): UNA petición por ref+rev. */
    cargar: (ref: string, rev: number) => Promise<AdnAvatar | null>;
    /** Aviso de que el ADN de un avatar cambió (la escena y el editor redibujan). */
    alCambiar?: (ref: string, adn: AdnAvatar) => void;
}
export interface SincroniaAdn {
    seguir(presentes: readonly PresenciaConAdn[]): void;
    recibir(msg: unknown): boolean;
    adnXR(ref: string, avatar: AvatarCalidad): RecorteXR | null;
    revisiones(): Record<string, number>;
}
export function crearSincroniaAdn(o: OpcionesSincroniaAdn): SincroniaAdn {
    const estados = new Map<string, EstadoRef>();
    const pedir = (es: EstadoRef, rev: number) => {
        es.pedida = Math.max(es.pedida, rev);
        const entrada = (adn: AdnAvatar | null) => {
            if (adn && adn.rev > es.rev) {
                es.adn = adn;
                es.rev = adn.rev;
                o.alCambiar?.(es.ref, adn);
            }
            const p = es.pendiente;
            es.pendiente = null;
            if (p) aplicarYAvisar(es, p, o.alCambiar);
        };
        o.cargar(es.ref, rev).then(entrada, () => entrada(null));
    };
    return {
        seguir(presentes) {
            const vistas = new Map<string, number>();
            for (const p of presentes) {
                if (typeof p.adnRef !== "string" || !esRefInterna(p.adnRef)) continue;
                vistas.set(p.adnRef, Math.max(vistas.get(p.adnRef) ?? 0, revDe(p.adnRev ?? 0) ?? 0));
            }
            for (const [ref, rev] of vistas) {
                let es = estados.get(ref);
                if (!es) estados.set(ref, (es = { ref, pedida: 0, rev: -1, adn: null, pendiente: null }));
                if (rev > es.rev && rev > es.pedida) pedir(es, rev);
            }
        },
        recibir(msg) {
            const e = sanearEventoAdn(msg);
            if (!e) return false;
            const es = estados.get(e.ref);
            if (!es || e.rev <= es.rev) return false;
            if (!es.adn) {
                if (!es.pendiente || e.rev > es.pendiente.rev) es.pendiente = e;
                return false;
            }
            return aplicarYAvisar(es, e, o.alCambiar);
        },
        adnXR(ref, avatar) {
            const adn = estados.get(ref)?.adn;
            return adn ? adnParaCalidad(adn, avatar) : null;
        },
        revisiones() {
            const out: Record<string, number> = {};
            for (const [ref, es] of estados) out[ref] = es.rev;
            return out;
        },
    };
}
