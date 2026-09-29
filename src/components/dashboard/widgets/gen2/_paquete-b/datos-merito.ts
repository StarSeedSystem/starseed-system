"use client";
/**
 * Mérito del entendimiento (paquete B · Ola 0929) — insignias REALES.
 *
 * Fuente: `badges` (catálogo), `profiles` (tus facetas) y `profile_badges` (lo que se te ha
 * otorgado y quién). Mismo criterio que el motor (src/lib/governance/merit.ts y la SQL de
 * gov_resolve_proposal): solo cuentan como mérito las insignias AVALADAS POR OTRA PERSONA; cada
 * una suma +0,5 al peso de TU voz en su área (o en todas si es «general»), con tope ×2, y solo
 * en las decisiones que activan la meritocracia (por defecto: una persona, un voto).
 */
import { createClient } from "@/utils/supabase/client";

export type AreaMerito = "general" | "politica" | "educacion" | "cultura";
export const AREAS_MERITO: AreaMerito[] = ["politica", "educacion", "cultura", "general"];
export const ETIQUETA_AREA: Record<AreaMerito, string> = { politica: "Política", educacion: "Educación", cultura: "Cultura", general: "General" };
export const COLOR_AREA: Record<AreaMerito, string> = { politica: "#ff5c7a", educacion: "#a78bfa", cultura: "#FFBF00", general: "#23d5ab" };

export interface InsigniaCatalogo { id: string; codigo: string; nombre: string; descripcion: string | null; area: AreaMerito }
export interface InsigniaMia extends InsigniaCatalogo { otorgada: number | null; avalada: boolean }
export interface DatosMerito { uid: string | null; catalogo: InsigniaCatalogo[]; mias: InsigniaMia[] }

const PASO = 0.5;
const TOPE = 1;

export function areaDe(v: unknown): AreaMerito {
    return v === "politica" || v === "educacion" || v === "cultura" ? v : "general";
}

/** Multiplicador de mérito de tu voz en un área (1 … 2), con las insignias avaladas. PURO. */
export function multiplicador(mias: Pick<InsigniaMia, "area" | "avalada">[], area: AreaMerito): number {
    const n = mias.filter((m) => m.avalada && (m.area === area || m.area === "general")).length;
    return 1 + Math.min(TOPE, n * PASO);
}

/** Por área: cuántas tienes, cuántas hay y tu multiplicador. PURO. */
export function resumenAreas(d: Pick<DatosMerito, "catalogo" | "mias">): { area: AreaMerito; tienes: number; hay: number; avaladas: number; mult: number }[] {
    return AREAS_MERITO.map((area) => ({
        area,
        tienes: d.mias.filter((m) => m.area === area).length,
        hay: d.catalogo.filter((b) => b.area === area).length,
        avaladas: d.mias.filter((m) => m.area === area && m.avalada).length,
        mult: multiplicador(d.mias, area),
    }));
}

export async function cargarMerito(uid: string | null): Promise<DatosMerito> {
    const sb = createClient();
    const cat = await sb.from("badges").select("id, code, name, description, area").order("name");
    if (cat.error) throw new Error("No se pudo leer el catálogo de insignias.");
    const catalogo: InsigniaCatalogo[] = ((cat.data as { id: string; code: string; name: string; description: string | null; area: string | null }[] | null) ?? [])
        .map((b) => ({ id: b.id, codigo: b.code, nombre: b.name, descripcion: b.description ?? null, area: areaDe(b.area) }));
    if (!uid) return { uid: null, catalogo, mias: [] };
    const perf = await sb.from("profiles").select("id").eq("user_id", uid).limit(8);
    const ids = ((perf.data as { id: string }[] | null) ?? []).map((p) => p.id).filter(Boolean);
    if (ids.length === 0) return { uid, catalogo, mias: [] };
    const pb = await sb.from("profile_badges").select("badge_id, awarded_at, awarded_by").in("profile_id", ids).limit(300);
    const porId = new Map(catalogo.map((b) => [b.id, b]));
    const vistas = new Set<string>();
    const mias: InsigniaMia[] = [];
    for (const r of (pb.data as { badge_id: string; awarded_at: string | null; awarded_by: string | null }[] | null) ?? []) {
        const b = porId.get(r.badge_id);
        if (!b) continue;
        const avalada = !!r.awarded_by && r.awarded_by !== uid;
        if (vistas.has(b.id)) {
            // La misma insignia en otra faceta: basta un aval de otra persona para que cuente.
            if (avalada) { const m = mias.find((x) => x.id === b.id); if (m) m.avalada = true; }
            continue;
        }
        vistas.add(b.id);
        mias.push({ ...b, otorgada: r.awarded_at ? Date.parse(r.awarded_at) || null : null, avalada });
    }
    mias.sort((a, b) => (b.otorgada ?? 0) - (a.otorgada ?? 0));
    return { uid, catalogo, mias };
}
