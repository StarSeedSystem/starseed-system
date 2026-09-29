/**
 * Markdown ligero de las notas rápidas (paquete E) — PURO y seguro: produce nodos de React (texto
 * escapado por React), nunca HTML. Entiende **negrita**, _cursiva_ o *cursiva*, `código`,
 * listas «- », casillas «- [ ] / - [x]» (que se pueden marcar), #etiquetas y enlaces http(s).
 */
import * as React from "react";
import { normalizarE } from "./lanzador";

export type Segmento =
    | { t: "texto"; v: string }
    | { t: "negrita"; v: string }
    | { t: "cursiva"; v: string }
    | { t: "codigo"; v: string }
    | { t: "etiqueta"; v: string }
    | { t: "enlace"; v: string };

const PATRON = /(\*\*[^*]+\*\*|`[^`]+`|_[^_\s][^_]*_|\*[^*\s][^*]*\*|#[\p{L}\p{N}_-]{2,}|https?:\/\/[^\s)]+)/gu;

export function segmentar(linea: string): Segmento[] {
    const out: Segmento[] = [];
    let ultimo = 0;
    for (const m of linea.matchAll(PATRON)) {
        const i = m.index ?? 0;
        if (i > ultimo) out.push({ t: "texto", v: linea.slice(ultimo, i) });
        const s = m[0];
        if (s.startsWith("**")) out.push({ t: "negrita", v: s.slice(2, -2) });
        else if (s.startsWith("`")) out.push({ t: "codigo", v: s.slice(1, -1) });
        else if (s.startsWith("#")) out.push({ t: "etiqueta", v: s.slice(1) });
        else if (s.startsWith("http")) out.push({ t: "enlace", v: s });
        else out.push({ t: "cursiva", v: s.slice(1, -1) });
        ultimo = i + s.length;
    }
    if (ultimo < linea.length) out.push({ t: "texto", v: linea.slice(ultimo) });
    return out;
}

export type Linea = { tipo: "parrafo" | "lista"; segs: Segmento[] } | { tipo: "casilla"; hecha: boolean; segs: Segmento[]; indice: number };

export function lineasDe(texto: string): Linea[] {
    return texto.split("\n").map((l, indice) => {
        const c = l.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/);
        if (c) return { tipo: "casilla", hecha: c[1].toLowerCase() === "x", segs: segmentar(c[2]), indice };
        const li = l.match(/^\s*[-*•]\s+(.*)$/);
        if (li) return { tipo: "lista", segs: segmentar(li[1]) };
        return { tipo: "parrafo", segs: segmentar(l) };
    });
}

/** Marca o desmarca la casilla de la línea `indice`. */
export function alternarCasilla(texto: string, indice: number): string {
    const ls = texto.split("\n");
    const l = ls[indice];
    if (l === undefined) return texto;
    ls[indice] = l.replace(/\[( |x|X)\]/, (_m, v: string) => (v === " " ? "[x]" : "[ ]"));
    return ls.join("\n");
}

export function etiquetasDe(texto: string): string[] {
    const set = new Set<string>();
    for (const s of texto.split("\n").flatMap(segmentar)) if (s.t === "etiqueta") set.add(s.v.toLowerCase());
    return [...set];
}

export function casillasDe(texto: string): { hechas: number; total: number } {
    const cs = lineasDe(texto).filter((l): l is Extract<Linea, { tipo: "casilla" }> => l.tipo === "casilla");
    return { hechas: cs.filter((c) => c.hecha).length, total: cs.length };
}

export function coincideNota(texto: string, consulta: string): boolean {
    const q = normalizarE(consulta);
    return !q || normalizarE(texto).includes(q);
}

/** Pinta los segmentos (texto seguro; los enlaces solo http/https, en pestaña nueva). */
export function PintaSegmentos({ segs, color, alEtiqueta }: { segs: Segmento[]; color: string; alEtiqueta?: (e: string) => void }) {
    return (
        <>
            {segs.map((s, i) => {
                switch (s.t) {
                    case "negrita": return <strong key={i} className="font-semibold text-white">{s.v}</strong>;
                    case "cursiva": return <em key={i}>{s.v}</em>;
                    case "codigo": return <code key={i} className="rounded bg-black/30 px-1 font-mono text-[0.9em]">{s.v}</code>;
                    case "etiqueta": return alEtiqueta
                        ? <button key={i} type="button" onClick={(e) => { e.stopPropagation(); alEtiqueta(s.v.toLowerCase()); }} className="cursor-pointer font-medium hover:underline" style={{ color }}>#{s.v}</button>
                        : <span key={i} className="font-medium" style={{ color }}>#{s.v}</span>;
                    case "enlace": return <a key={i} href={s.v} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="break-all underline decoration-white/40 hover:decoration-white" style={{ color }}>{s.v.replace(/^https?:\/\//, "")}</a>;
                    default: return <React.Fragment key={i}>{s.v}</React.Fragment>;
                }
            })}
        </>
    );
}
