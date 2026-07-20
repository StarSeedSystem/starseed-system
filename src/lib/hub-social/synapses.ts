"use client";

/**
 * ── hub-social/synapses — Círculos de afinidad «Sinapsis sugeridas» ──────────
 *
 * Sugiere entidades de la red con las que AÚN no conectas, puntuadas por
 * solapamiento REAL con tu grafo: etiquetas en común con tus conexiones, mismo
 * sistema que ya cultivas, y un empujón de DIVERSIDAD hacia los sistemas que te
 * faltan (coherente con el panel de Diversidad). Cada sugerencia explica su
 * porqué con motivos legibles («3 conexiones afines · mismo sistema cultural»).
 *
 * Todo se computa del catálogo público (tags/sistema/tipo) + tus conexiones
 * reales: sin lecturas cruzadas de otras cuentas (respeto a la privacidad,
 * CLAUDE.md §6). Es honesto: si no hay señal, no hay sugerencia inflada.
 */

import { SYSTEM_META } from "@/lib/hub-social/meta";
import type { GraphNode, GraphMetrics } from "@/lib/hub-social/graph";
import { missingSystems } from "@/lib/hub-social/diversity";

export interface Synapse {
    node: GraphNode;
    score: number;
    /** Motivos cortos y legibles (para chips). */
    reasons: string[];
}

interface Signals {
    sharedTagConns: number;   // nº de MIS conexiones que comparten ≥1 etiqueta
    sharedTags: Set<string>;  // etiquetas concretas compartidas
    sameSystemConns: number;  // nº de MIS conexiones en el mismo sistema
    diversityBoost: boolean;  // el candidato pertenece a un sistema que me falta
}

function analyze(candidate: GraphNode, mine: GraphNode[], missing: Set<string>): Signals {
    const candTags = new Set(candidate.tags.map((t) => t.toLowerCase()).filter(Boolean));
    const sharedTags = new Set<string>();
    let sharedTagConns = 0;
    let sameSystemConns = 0;
    for (const conn of mine) {
        if (conn.system === candidate.system) sameSystemConns += 1;
        if (candTags.size === 0) continue;
        let hit = false;
        for (const t of conn.tags) {
            const lt = t.toLowerCase();
            if (candTags.has(lt)) { sharedTags.add(lt); hit = true; }
        }
        if (hit) sharedTagConns += 1;
    }
    return {
        sharedTagConns,
        sharedTags,
        sameSystemConns,
        diversityBoost: missing.has(candidate.system),
    };
}

function reasonsOf(candidate: GraphNode, s: Signals): string[] {
    const out: string[] = [];
    if (s.sharedTagConns > 0) {
        out.push(`${s.sharedTagConns} conexión${s.sharedTagConns === 1 ? "" : "es"} afín${s.sharedTagConns === 1 ? "" : "es"}`);
    }
    if (s.sharedTags.size > 0) {
        const sample = Array.from(s.sharedTags).slice(0, 2).join(", ");
        out.push(`Etiquetas: ${sample}`);
    }
    if (s.diversityBoost) {
        out.push(`Amplía tu sistema ${SYSTEM_META[candidate.system].label.toLowerCase()}`);
    } else if (s.sameSystemConns > 0) {
        out.push(`Mismo sistema ${SYSTEM_META[candidate.system].label.toLowerCase()}`);
    }
    if (out.length === 0) out.push("Nodo emergente de la red");
    return out;
}

/**
 * Devuelve las mejores sinapsis sugeridas (entidades no conectadas), ordenadas
 * por puntuación. `limit` acota el carrusel.
 */
export function suggestSynapses(
    catalog: GraphNode[],
    mine: GraphNode[],
    metrics: GraphMetrics,
    limit = 8,
): Synapse[] {
    const mineSlugs = new Set(mine.map((n) => n.slug));
    const missing = new Set<string>(missingSystems(metrics));
    const hasNetwork = mine.length > 0;

    const scored: Synapse[] = [];
    for (const candidate of catalog) {
        if (mineSlugs.has(candidate.slug)) continue; // ya conectado
        const s = analyze(candidate, mine, missing);
        let score = s.sharedTagConns * 3 + s.sharedTags.size * 2 + s.sameSystemConns * 0.5;
        if (s.diversityBoost) score += 4;
        // Desempate suave por tamaño de la entidad (más viva = más útil descubrir).
        score += Math.min(1.5, Math.log10(1 + candidate.count) / 2);
        // Si aún no tengo red, prioriza entidades vivas y variadas.
        if (!hasNetwork) score += Math.min(2, Math.log10(1 + candidate.count));
        if (score <= 0) continue;
        scored.push({ node: candidate, score, reasons: reasonsOf(candidate, s) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}
