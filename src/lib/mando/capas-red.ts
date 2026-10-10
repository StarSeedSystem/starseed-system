/**
 * capas-red.ts — la pestaña «Capas» de Genesis (contrato
 * `architecture/capas-autoadaptables.md` §10), en su parte PURA: junta el
 * catálogo (`config/capas-astraura.json`), el estado del renovador
 * (`~/.starseed/capas-estado.json` · `capas_renovar.py`), las fichas de
 * capacidades de los nodos (`src/lib/network/capacidades-nodo.ts`) y el último
 * resultado del banco, y devuelve filas por capa. SIN disco, red ni `node:*`
 * (todo lo externo lo inyecta la ruta); lo que no esté medido sale como
 * `null` («sin medir»), nunca como cero inventado.
 */

import type { CapacidadesNodo } from "@/lib/network/capacidades-nodo";

export type EstadoCapa = "recomendado" | "respaldo" | "en-banco" | string;

/** Entrada del catálogo ya cribada para la interfaz (sin rutas de disco). */
export interface CapaCatalogo {
    id: string;
    capa: string;
    modelo: string;
    version: string | null;
    estado: EstadoCapa;
    espejos: string[];
    sha256: string | null;
}

/** Último resultado conocido del banco para una capa; `null` = sin medir. */
export interface UltimoBanco {
    tokS: number | null;
    latenciaMs: number | null;
    acierto: number | null;
    fecha: string | null;
}

/** Una capa candidata detectada en Hugging Face por el renovador. */
export interface CapaNueva {
    repo: string;
    estado: string | null;
    lastModified: string | null;
}

export interface FilaCapaRed {
    id: string;
    capa: string;
    modelo: string;
    version: string | null;
    estado: EstadoCapa;
    /** La capa tiene su SHA en el catálogo: solo así puede usarse (§6). */
    shaVerificado: boolean;
    espejos: number;
    /** Conteos MEDIDOS desde las fichas; `null` cuando no hay ficha alguna. */
    dispositivos: number | null;
    servidores: number | null;
    banco: UltimoBanco | null;
}

export interface ResumenCapasRed {
    filas: FilaCapaRed[];
    nuevas: CapaNueva[];
    actualizado: string | null;
}

/** `id` de una cadena "id@versión[#sha8]" de las fichas (§7). */
export function idDeEntradaCapa(entrada: string): string {
    return entrada.split("@")[0].split("#")[0].trim().toLowerCase();
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function numero(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Criba el JSON del catálogo a `CapaCatalogo[]` (lo ilegible se salta). */
export function leerCatalogoCapas(crudo: unknown): CapaCatalogo[] {
    if (!esObjeto(crudo) || !Array.isArray(crudo.capas)) return [];
    const salida: CapaCatalogo[] = [];
    for (const c of crudo.capas) {
        if (!esObjeto(c)) continue;
        const id = texto(c.id);
        if (!id) continue;
        salida.push({
            id,
            capa: texto(c.capa) ?? "desconocida",
            modelo: texto(c.modelo) ?? id,
            version: texto(c.version),
            estado: texto(c.estado) ?? "desconocido",
            espejos: Array.isArray(c.espejos) ? c.espejos.filter(texto) : [],
            sha256: texto(c.sha256),
        });
    }
    return salida;
}

/** Criba el estado del renovador (`capas-estado.json`). */
export function leerNuevas(crudo: unknown): { nuevas: CapaNueva[]; actualizado: string | null } {
    if (!esObjeto(crudo)) return { nuevas: [], actualizado: null };
    const nuevas: CapaNueva[] = [];
    if (Array.isArray(crudo.nuevas)) {
        for (const n of crudo.nuevas) {
            if (!esObjeto(n)) continue;
            const repo = texto(n.repo) ?? texto(n.fuente_oficial);
            if (!repo) continue;
            nuevas.push({ repo, estado: texto(n.estado), lastModified: texto(n.lastModified) });
        }
    }
    return { nuevas, actualizado: texto(crudo.actualizado) };
}

/**
 * Criba el JSON del banco (`~/.starseed/capas-banco.json`): acepta una lista
 * de resultados o un mapa `{ capaId: resultado }`; cada registro se
 * identifica por `capaId`, `id`, `capa` o `modelo`. Gana el más reciente.
 */
export function leerBanco(crudo: unknown): Map<string, UltimoBanco> {
    const mapa = new Map<string, UltimoBanco>();
    const anotar = (clave: string | null, r: Record<string, unknown>) => {
        if (!clave) return;
        const fecha = texto(r.fecha) ?? texto(r.actualizado) ?? texto(r.t);
        const anterior = mapa.get(clave);
        if (anterior && (!fecha || (anterior.fecha !== null && anterior.fecha >= fecha))) return;
        mapa.set(clave, {
            tokS: numero(r.tok_s) ?? numero(r.tokS),
            latenciaMs: numero(r.latencia_ms) ?? numero(r.latenciaMs),
            acierto: numero(r.acierto),
            fecha,
        });
    };
    const claveDe = (r: Record<string, unknown>): string | null =>
        texto(r.capaId) ?? texto(r.capa_id) ?? texto(r.id) ?? texto(r.capa) ?? texto(r.modelo);
    if (Array.isArray(crudo)) {
        for (const r of crudo) if (esObjeto(r)) anotar(claveDe(r), r);
    } else if (esObjeto(crudo)) {
        for (const [clave, r] of Object.entries(crudo)) {
            if (esObjeto(r)) anotar(claveDe(r) ?? clave, r);
        }
    }
    return mapa;
}

/**
 * Construye las filas de la pestaña: una por capa del catálogo, con los
 * conteos MEDIDOS desde las fichas reales de los nodos. Sin fichas, los
 * conteos son `null` («sin medir»): jamás un cero que parezca medido.
 * Un medio "nube" cuenta como servidor; el resto, como dispositivo.
 */
export function construirResumenRed(entrada: {
    catalogo: CapaCatalogo[];
    fichas: CapacidadesNodo[];
    banco?: Map<string, UltimoBanco>;
    nuevas?: CapaNueva[];
    actualizado?: string | null;
}): ResumenCapasRed {
    const hayFichas = entrada.fichas.length > 0;
    const filas = entrada.catalogo.map((capa) => {
        let dispositivos = 0;
        let servidores = 0;
        for (const ficha of entrada.fichas) {
            const laTiene = (ficha.capas ?? []).some((c) => idDeEntradaCapa(c) === capa.id.toLowerCase());
            if (!laTiene) continue;
            if (ficha.medio === "nube") servidores += 1;
            else dispositivos += 1;
        }
        return {
            id: capa.id,
            capa: capa.capa,
            modelo: capa.modelo,
            version: capa.version,
            estado: capa.estado,
            shaVerificado: capa.sha256 !== null,
            espejos: capa.espejos.length,
            dispositivos: hayFichas ? dispositivos : null,
            servidores: hayFichas ? servidores : null,
            banco: entrada.banco?.get(capa.id) ?? null,
        };
    });
    return {
        filas,
        nuevas: entrada.nuevas ?? [],
        actualizado: entrada.actualizado ?? null,
    };
}
