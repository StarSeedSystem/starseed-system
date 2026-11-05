// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Rotación de actualizaciones (Ola 1104 · RPO1104Ub)
// ------------------------------------------------------------------------------
// Módulo PURO: planifica qué fuentes consultar en cada pasada, respetando
// límites de GitHub (60 sin token, 300 con token) y priorizando las que
// nunca se han visto o llevan más tiempo sin actualizarse.
// ════════════════════════════════════════════════════════════════════════════

export interface EntradaFuente {
    id: string;
    instalada: string;
    upstream: string;
    payload?: PayloadActualizacion;
}

export interface Conocida {
    id: string;
    remota: string | null;
    fecha: string | null;
    t: number;
}

export interface OpcionesLote {
    maxLote: number;
    edadMinMs: number;
}

const MS_SEGUNDO = 1000;
const MS_HORA = 60 * MS_SEGUNDO;
const MS_DIA = 24 * MS_HORA;

export interface FuenteConocida extends Conocida {
    id: string;
}

export function loteAConsultar(
    entradas: EntradaFuente[],
    conocidas: Conocida[],
    ahora: number,
    opts: OpcionesLote = { maxLote: 40, edadMinMs: MS_DIA },
): string[] {
    const mapa = new Map<string, Conocida>();
    for (const c of conocidas) {
        mapa.set(c.id, c);
    }

    const idsSinConocer: string[] = [];
    const idsAntiguos: Array<{ id: string; edad: number }> = [];

    for (const entrada of entradas) {
        const conocida = mapa.get(entrada.id);
        if (!conocida) {
            idsSinConocer.push(entrada.id);
        } else if (conocida.remota === null) {
            idsSinConocer.push(entrada.id);
        } else {
            const edad = ahora - (conocida.t ?? 0);
            idsAntiguos.push({ id: entrada.id, edad });
        }
    }

    idsAntiguos.sort((a, b) => b.edad - a.edad);

    const resultado: string[] = [];
    for (const id of idsSinConocer) {
        if (resultado.length >= opts.maxLote) return resultado;
        resultado.push(id);
    }

    for (const item of idsAntiguos) {
        if (item.edad < opts.edadMinMs) continue;
        if (resultado.length >= opts.maxLote) return resultado;
        if (!resultado.includes(item.id)) resultado.push(item.id);
    }

    return resultado;
}

export function fusionar(
    conocidas: Conocida[],
    resultados: Array<{ id: string; remota: string | null; fecha: string | null }>,
    ahora: number,
): Conocida[] {
    const mapa = new Map<string, Conocida>();
    for (const c of conocidas) {
        mapa.set(c.id, { ...c });
    }

    for (const r of resultados) {
        const existente = mapa.get(r.id);
        if (existente && r.remota === null) {
            continue;
        }
        mapa.set(r.id, {
            id: r.id,
            remota: r.remota,
            fecha: r.fecha,
            t: ahora,
        });
    }

    return Array.from(mapa.values());
}

import type { PayloadActualizacion } from "./actualizaciones";