/**
 * Veredictos de las tareas atascadas (Ola 343 · JV3 · solo el lector local).
 *
 * `scripts/puente/veredictos.py` escribe `starseed_memory_root/olas/veredictos.json`
 * con la forma `{ t, veredictos: [{id, estado, veredicto, cambio, motivo, confianza, fuente}] }`.
 * Este módulo lo lee con tolerancia (sin archivo → lista vacía, nunca lanza) y decide
 * el tono con que el Mando lo enseña al abrir una bloqueada. Es solo lectura de disco
 * local: no llama a Jev ni a ninguna red, y jamás devuelve claves ni rutas absolutas.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export type VeredictoTipo = "reintentar" | "reintentar_con_cambio" | "descartar" | "esperar";
export type FuenteVeredicto = "regla" | "jev" | "nadie";

export interface FilaVeredicto {
    id: string;
    estado: string;
    veredicto: VeredictoTipo;
    /** Instrucción del reintentar_con_cambio (objeción literal del revisor), o "". */
    cambio: string;
    motivo: string;
    /** 0..1; las reglas deterministas llevan 1.0. */
    confianza: number;
    fuente: FuenteVeredicto;
}

export interface ListaVeredictos {
    t: string | null;
    veredictos: FilaVeredicto[];
}

export type TonoColor = "verde" | "ambar" | "gris";

export interface TonoVeredicto {
    tono: TonoColor;
    etiqueta: string;
}

const VEREDICTOS = new Set<VeredictoTipo>(["reintentar", "reintentar_con_cambio", "descartar", "esperar"]);
const FUENTES = new Set<FuenteVeredicto>(["regla", "jev", "nadie"]);

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/** Convierte el JSON bruto del archivo en una lista tipada; descarta filas irreconocibles. */
export function parsearVeredictos(bruto: unknown): ListaVeredictos {
    if (typeof bruto !== "object" || bruto === null) return { t: null, veredictos: [] };
    const dato = bruto as Record<string, unknown>;
    const crudas = Array.isArray(dato.veredictos) ? dato.veredictos : [];
    const veredictos: FilaVeredicto[] = [];
    for (const cruda of crudas) {
        if (typeof cruda !== "object" || cruda === null) continue;
        const f = cruda as Record<string, unknown>;
        const id = texto(f.id);
        const veredicto = texto(f.veredicto) as VeredictoTipo;
        if (!id || !VEREDICTOS.has(veredicto)) continue;
        const confianza = typeof f.confianza === "number" && Number.isFinite(f.confianza) ? f.confianza : 0;
        const fuenteBruta = texto(f.fuente) as FuenteVeredicto;
        veredictos.push({
            id,
            estado: texto(f.estado),
            veredicto,
            cambio: texto(f.cambio),
            motivo: texto(f.motivo),
            confianza: Math.max(0, Math.min(1, confianza)),
            fuente: FUENTES.has(fuenteBruta) ? fuenteBruta : "nadie",
        });
    }
    return { t: texto(dato.t) || null, veredictos };
}

/**
 * Lee `starseed_memory_root/olas/veredictos.json` bajo `raiz`.
 * Sin archivo o JSON corrupto → lista vacía; el Mando sigue funcionando igual.
 */
export async function leerVeredictos(raiz: string): Promise<ListaVeredictos> {
    try {
        const contenido = await readFile(
            path.join(raiz, "starseed_memory_root", "olas", "veredictos.json"),
            "utf-8",
        );
        return parsearVeredictos(JSON.parse(contenido) as unknown);
    } catch {
        return { t: null, veredictos: [] };
    }
}

/** El veredicto de un id concreto, o null si no lo hay (no se pinta nada entonces). */
export function veredictoDe(lista: ListaVeredictos, id: string): FilaVeredicto | null {
    if (!id) return null;
    return lista.veredictos.find((f) => f.id === id) ?? null;
}

/**
 * Tono y etiqueta para la tarjeta de la bloqueada:
 * reintentar / reintentar_con_cambio → verde · esperar → ámbar · descartar → gris.
 * Un «jev» con confianza < 0,7 no basta para decidir: lo mira el director.
 */
export function tonoDe(v: FilaVeredicto): TonoVeredicto {
    const tono: TonoColor =
        v.veredicto === "esperar" ? "ambar" : v.veredicto === "descartar" ? "gris" : "verde";
    const dudoso = v.fuente === "jev" && v.confianza < 0.7;
    const etiqueta = dudoso ? `${v.veredicto} · dudoso: lo mira el director` : v.veredicto;
    return { tono, etiqueta };
}
