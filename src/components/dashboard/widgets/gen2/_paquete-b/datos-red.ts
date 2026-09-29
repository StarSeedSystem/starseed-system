"use client";
/**
 * Publicaciones públicas de la Red (paquete B · Ola 0929) para el Ágora del don y la
 * Resonancia social.
 *
 * Fuente REAL: la tabla `posts` del OS (lo que publica el Compositor en «Red»), con el mismo
 * filtro que usa el feed de la Red (`post_references->target->>kind = red`). Se piden solo 50
 * filas y solo título y cuerpo (proyección JSON), una vez cada 10 min, compartidas por los dos
 * widgets. Los dones son publicaciones con #don/#ofrezco (ofrecer) o #pido/#necesito (pedir):
 * una convención a la vista, que el propio widget ayuda a usar abriendo el Compositor.
 */
import { createClient } from "@/utils/supabase/client";

export interface PublicacionRed { id: string; autor: string; ts: number; titulo: string; cuerpo: string }

const RECORTE = 400;

export async function cargarPublicacionesRed(): Promise<PublicacionRed[]> {
    const sb = createClient();
    const { data, error } = await sb
        .from("posts")
        .select("id, author_name, created_at, titulo:content->>title, cuerpo:content->>body")
        .eq("post_references->target->>kind", "red")
        .order("created_at", { ascending: false })
        .limit(50);
    if (error) throw new Error("No se pudieron leer las publicaciones de la Red.");
    return ((data as { id: string; author_name: string | null; created_at: string | null; titulo: string | null; cuerpo: string | null }[] | null) ?? [])
        .map((r) => ({
            id: String(r.id),
            autor: r.author_name?.trim() || "Alguien de la red",
            ts: r.created_at ? Date.parse(r.created_at) || 0 : 0,
            titulo: (r.titulo ?? "").trim().slice(0, 160),
            cuerpo: (r.cuerpo ?? "").trim().slice(0, RECORTE),
        }))
        .filter((p) => p.titulo || p.cuerpo);
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

/** Etiquetas (#algo) de un texto, en minúsculas y sin repetir. PURO. */
export function extraerEtiquetas(texto: string): string[] {
    const vistas = new Set<string>();
    for (const m of texto.matchAll(/#([\p{L}\p{N}_-]{2,40})/gu)) vistas.add(m[1].toLowerCase());
    return Array.from(vistas);
}

export type TipoDon = "ofrezco" | "pido";
export interface Don { id: string; tipo: TipoDon; que: string; autor: string; ts: number }

const OFRECER = new Set(["don", "dones", "ofrezco", "regalo", "comparto"]);
const PEDIR = new Set(["pido", "necesito", "busco"]);

/** Qué es un don: si la publicación lleva #don/#ofrezco… o #pido/#necesito…; si no, null. PURO. */
export function donDe(p: PublicacionRed): Don | null {
    const etiquetas = extraerEtiquetas(`${p.titulo} ${p.cuerpo}`);
    const tipo: TipoDon | null = etiquetas.some((e) => PEDIR.has(e)) ? "pido" : etiquetas.some((e) => OFRECER.has(e)) ? "ofrezco" : null;
    if (!tipo) return null;
    const limpio = (s: string) => s.replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/\s+/g, " ").trim();
    const que = limpio(p.titulo) || limpio(p.cuerpo).slice(0, 90) || (tipo === "pido" ? "Una petición" : "Un don");
    return { id: p.id, tipo, que, autor: p.autor, ts: p.ts };
}

export function dones(lista: PublicacionRed[]): Don[] {
    return lista.map(donDe).filter((d): d is Don => d !== null);
}

export interface TemaResonancia { etiqueta: string; n: number; calor: number; ultima: number; ids: string[] }

/**
 * Lo que resuena: las etiquetas de las publicaciones, por número de publicaciones y por calor
 * (cada publicación suma e^(−edad/72 h), así pesa más lo reciente). Sin las de los dones. PURO.
 */
export function resonancia(lista: PublicacionRed[], ahora = Date.now()): TemaResonancia[] {
    const m = new Map<string, TemaResonancia>();
    for (const p of lista) {
        const edad = Math.max(0, ahora - p.ts);
        const peso = Math.exp(-edad / (72 * 3_600_000));
        for (const e of extraerEtiquetas(`${p.titulo} ${p.cuerpo}`)) {
            if (OFRECER.has(e) || PEDIR.has(e)) continue;
            const t = m.get(e) ?? { etiqueta: e, n: 0, calor: 0, ultima: 0, ids: [] };
            t.n += 1;
            t.calor += peso;
            t.ultima = Math.max(t.ultima, p.ts);
            t.ids.push(p.id);
            m.set(e, t);
        }
    }
    const temas = Array.from(m.values());
    const max = Math.max(...temas.map((t) => t.calor), 0.0001);
    return temas.map((t) => ({ ...t, calor: t.calor / max })).sort((a, b) => b.calor - a.calor || b.n - a.n);
}

/** Enlace del Compositor con la intención ya escrita (ruta real /publicar). */
export function enlaceComponer(intencion: string): string {
    return `/publicar?area=general&intent=${encodeURIComponent(intencion)}`;
}
