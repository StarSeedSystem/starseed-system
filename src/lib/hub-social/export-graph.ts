"use client";

/**
 * ── hub-social/export-graph — Exporta mi grafo (Identidad Soberana §6) ───────
 *
 * El usuario es único propietario de sus datos: puede llevárselos. Genera un
 * documento portátil de sus conexiones (follows / memberships / administrando)
 * con un manifiesto {exportadoEn, perfil, versión}, en tres formatos:
 *   · JSON  — estructura completa y re-importable.
 *   · CSV   — tabular, para hojas de cálculo.
 *   · Markdown — legible, para copiar/pegar.
 *
 * Funciones puras + un disparador de descarga en el navegador. Nunca lanza.
 */

import { SYSTEM_META, TYPE_META, BOND_LABEL } from "@/lib/hub-social/meta";
import type { GraphNode, GraphMetrics, ActiveProfileLite } from "@/lib/hub-social/graph";

export const EXPORT_VERSION = "1.0";

export interface ExportManifest {
    exportadoEn: string;
    perfil: { id: string | null; nombre: string | null };
    version: string;
    generadoPor: string;
}

export interface ExportConnection {
    slug: string;
    nombre: string;
    tipo: string;
    sistema: string;
    vinculos: string[];
    desde: string | null;
    contador: number;
    url: string;
}

export interface ExportDoc {
    manifiesto: ExportManifest;
    resumen: {
        total: number;
        siguiendo: number;
        miembroDe: number;
        administrando: number;
        reciprocos: number;
        indiceEquilibrio: number;
        reciprocidadPct: number;
        porSistema: Record<string, number>;
        porTipo: Record<string, number>;
    };
    conexiones: ExportConnection[];
}

function connectionOf(node: GraphNode): ExportConnection {
    return {
        slug: node.slug,
        nombre: node.name,
        tipo: TYPE_META[node.type].singular,
        sistema: SYSTEM_META[node.system].label,
        vinculos: node.bonds.map((b) => BOND_LABEL[b]),
        desde: node.since ?? null,
        contador: node.count,
        url: node.href,
    };
}

export function buildExport(mine: GraphNode[], metrics: GraphMetrics, profile: ActiveProfileLite | null): ExportDoc {
    const porSistema: Record<string, number> = {};
    for (const [k, v] of Object.entries(metrics.perSystem)) porSistema[SYSTEM_META[k as keyof typeof SYSTEM_META].label] = v;
    const porTipo: Record<string, number> = {};
    for (const [k, v] of Object.entries(metrics.perType)) porTipo[TYPE_META[k as keyof typeof TYPE_META].singular] = v;

    return {
        manifiesto: {
            exportadoEn: new Date().toISOString(),
            perfil: { id: profile?.id ?? null, nombre: profile?.name ?? null },
            version: EXPORT_VERSION,
            generadoPor: "StarSeed OS · Hub de Conexiones",
        },
        resumen: {
            total: metrics.total,
            siguiendo: metrics.followCount,
            miembroDe: metrics.memberCount,
            administrando: metrics.adminCount,
            reciprocos: metrics.reciprocalCount,
            indiceEquilibrio: metrics.balanceIndex,
            reciprocidadPct: metrics.reciprocityPct,
            porSistema,
            porTipo,
        },
        conexiones: mine.map(connectionOf),
    };
}

export function toJSON(doc: ExportDoc): string {
    return JSON.stringify(doc, null, 2);
}

function csvCell(v: string | number): string {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(doc: ExportDoc): string {
    const header = ["slug", "nombre", "tipo", "sistema", "vinculos", "desde", "contador", "url"];
    const rows = doc.conexiones.map((c) =>
        [c.slug, c.nombre, c.tipo, c.sistema, c.vinculos.join(" · "), c.desde ?? "", c.contador, c.url]
            .map(csvCell).join(","),
    );
    return [header.join(","), ...rows].join("\n");
}

export function toMarkdown(doc: ExportDoc): string {
    const m = doc.manifiesto;
    const r = doc.resumen;
    const lines: string[] = [];
    lines.push(`# Mi grafo de conexiones — StarSeed`);
    lines.push("");
    lines.push(`> Exportado el ${new Date(m.exportadoEn).toLocaleString("es-ES")} · Perfil: ${m.perfil.nombre ?? "—"} · v${m.version}`);
    lines.push("");
    lines.push(`## Resumen`);
    lines.push(`- **Conexiones totales:** ${r.total}`);
    lines.push(`- **Siguiendo:** ${r.siguiendo} · **Miembro de:** ${r.miembroDe} · **Administrando:** ${r.administrando}`);
    lines.push(`- **Vínculos recíprocos:** ${r.reciprocos} · **Reciprocidad:** ${r.reciprocidadPct}%`);
    lines.push(`- **Índice de equilibrio:** ${r.indiceEquilibrio}/100`);
    lines.push(`- **Por sistema:** ${Object.entries(r.porSistema).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    lines.push("");
    lines.push(`## Conexiones`);
    if (doc.conexiones.length === 0) {
        lines.push("_Aún no tienes conexiones._");
    } else {
        lines.push(`| Nombre | Tipo | Sistema | Vínculos | Desde |`);
        lines.push(`| --- | --- | --- | --- | --- |`);
        for (const c of doc.conexiones) {
            const desde = c.desde ? new Date(c.desde).toLocaleDateString("es-ES") : "—";
            lines.push(`| ${c.nombre} | ${c.tipo} | ${c.sistema} | ${c.vinculos.join(" · ") || "—"} | ${desde} |`);
        }
    }
    lines.push("");
    lines.push(`_Identidad Soberana: estos datos son tuyos. StarSeed OS._`);
    return lines.join("\n");
}

/** Dispara la descarga de un archivo en el navegador. Nunca lanza. */
export function downloadFile(filename: string, content: string, mime: string): boolean {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    try {
        const blob = new Blob([content], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    } catch {
        return false;
    }
}

/** Copia texto al portapapeles. Devuelve true si lo logró. */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fallthrough */ }
    return false;
}

/** Nombre de archivo con fecha estable para la descarga. */
export function exportFilename(ext: string): string {
    const d = new Date().toISOString().slice(0, 10);
    return `starseed-grafo-conexiones-${d}.${ext}`;
}
