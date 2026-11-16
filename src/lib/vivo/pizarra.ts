/**
 * Pizarra compartida viva (SES1116, 2026-11-16) — modelo por REGISTRO.
 * Cada bloque y arista es `{ id, v, t, a, x? }` (reloj, autor y lápida), como `vivo/dashboard.ts`.
 * Editar ids distintos conserva ambas ediciones; el mismo id lo gana el `t` mayor; borrar deja
 * lápida en vez de desaparecer. La fusión vive en `./pizarra-fusion`. Archivo PURO (sin red).
 */
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";

export const FORMATO_PIZARRA = 1;
export const LIMITES_PIZARRA = { bloques: 2000, aristas: 4000, largoId: 80 } as const;
const DIA = 86_400_000;
export const LAPIDAS_PIZARRA_MS = 30 * DIA;

/** Un registro con su reloj, su autor y, si está borrado, su lápida. */
export interface RegistroBase<T> {
    id: string;
    v: T;
    t: number;
    a: string;
    x?: true;
}
export type RegistroBloque = RegistroBase<CanvasBlock>;
export type RegistroArista = RegistroBase<CanvasEdge>;

export interface DocPizarra {
    formato: typeof FORMATO_PIZARRA;
    bloques: Record<string, RegistroBloque>;
    aristas: Record<string, RegistroArista>;
}

export function pizarraVacia(): DocPizarra {
    return { formato: FORMATO_PIZARRA, bloques: {}, aristas: {} };
}

/** ¿Este doc de `os_spaces` es una pizarra viva? */
export function esDocPizarra(doc: Record<string, unknown> | null | undefined): boolean {
    return !!doc && doc.vivo === "pizarra";
}

/** Envuelve el doc para guardarlo, como hace `docDashboard`. */
export function docPizarra(d: DocPizarra): Record<string, unknown> {
    return { vivo: "pizarra", formato: FORMATO_PIZARRA, pizarra: d };
}

// ───────────────────────────── saneamiento ─────────────────────────────

const RE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const CLAVES_PROHIBIDAS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const esNumero = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
const idValido = (id: unknown): id is string =>
    typeof id === "string" && id.length <= LIMITES_PIZARRA.largoId && RE_ID.test(id) && !CLAVES_PROHIBIDAS.has(id);
const bloqueValido = (v: unknown): v is CanvasBlock =>
    esObjeto(v) && esNumero(v.x) && esNumero(v.y) && esNumero(v.w) && esNumero(v.h);
const aristaValida = (v: unknown): v is CanvasEdge => esObjeto(v) && typeof v.from === "string" && typeof v.to === "string";

function leerReg<T>(raw: unknown, valida: (v: unknown) => v is T): RegistroBase<T> | null {
    if (!esObjeto(raw) || !idValido(raw.id) || !esNumero(raw.t) || (raw.t as number) < 0) return null;
    if (typeof raw.a !== "string" || raw.a.length < 1 || raw.a.length > 24 || !valida(raw.v)) return null;
    return raw.x === true
        ? { id: raw.id, v: raw.v, t: raw.t as number, a: raw.a, x: true }
        : { id: raw.id, v: raw.v, t: raw.t as number, a: raw.a };
}

function leerMapaReg<T>(raw: unknown, valida: (v: unknown) => v is T, tope: number): Record<string, RegistroBase<T>> {
    const salida: Record<string, RegistroBase<T>> = {};
    if (!esObjeto(raw)) return salida;
    for (const [clave, r] of Object.entries(raw)) {
        if (!idValido(clave) || Object.keys(salida).length >= tope) continue;
        const leido = leerReg(r, valida);
        if (leido && leido.id === clave) salida[clave] = leido;
    }
    return salida;
}

function migrarLegado(o: Record<string, unknown>): DocPizarra {
    const salida = pizarraVacia();
    const copiar = <T>(lista: unknown, destino: Record<string, RegistroBase<T>>, tope: number, castear: (b: Record<string, unknown>) => T): void => {
        if (!Array.isArray(lista)) return;
        for (const b of lista) {
            if (Object.keys(destino).length >= tope) break;
            if (esObjeto(b) && idValido(b.id)) destino[b.id] = { id: b.id, v: castear(b), t: 0, a: "legado" };
        }
    };
    copiar(o.blocks, salida.bloques, LIMITES_PIZARRA.bloques, (b) => b as unknown as CanvasBlock);
    copiar(o.edges, salida.aristas, LIMITES_PIZARRA.aristas, (e) => e as unknown as CanvasEdge);
    return salida;
}

/** Lee una pizarra venida de fuera sin fiarse de nada y migra el formato viejo `{blocks, edges}`. */
export function normalizarPizarra(raw: unknown): DocPizarra {
    if (!esObjeto(raw)) return pizarraVacia();
    const o = esObjeto(raw.pizarra) ? raw.pizarra : raw;
    const bloques = leerMapaReg(o.bloques, bloqueValido, LIMITES_PIZARRA.bloques);
    const aristas = leerMapaReg(o.aristas, aristaValida, LIMITES_PIZARRA.aristas);
    if (!Object.keys(bloques).length && !Object.keys(aristas).length && (Array.isArray(o.blocks) || Array.isArray(o.edges))) {
        return migrarLegado(o);
    }
    return { formato: FORMATO_PIZARRA, bloques, aristas };
}

/** Quita las lápidas de más de 30 días. Determinista: todas las copias podan lo mismo. */
export function podarPizarra(d: DocPizarra, ahora: number): DocPizarra {
    let bloques: Record<string, RegistroBloque> | null = null;
    let aristas: Record<string, RegistroArista> | null = null;
    for (const [id, r] of Object.entries(d.bloques)) if (r.x === true && ahora - r.t > LAPIDAS_PIZARRA_MS) { bloques ??= { ...d.bloques }; delete bloques[id]; }
    for (const [id, r] of Object.entries(d.aristas)) if (r.x === true && ahora - r.t > LAPIDAS_PIZARRA_MS) { aristas ??= { ...d.aristas }; delete aristas[id]; }
    if (!bloques && !aristas) return d;
    return { formato: FORMATO_PIZARRA, bloques: bloques ?? d.bloques, aristas: aristas ?? d.aristas };
}

/** El reloj más alto del documento (para saber si una copia trae algo nuevo). */
export function maxTiempoPizarra(d: DocPizarra): number {
    let max = 0;
    for (const r of Object.values(d.bloques)) if (r.t > max) max = r.t;
    for (const r of Object.values(d.aristas)) if (r.t > max) max = r.t;
    return max;
}
