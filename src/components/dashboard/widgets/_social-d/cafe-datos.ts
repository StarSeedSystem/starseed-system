"use client";
/**
 * Datos del Café (Ola 0929 · D) — las creaciones REALES de la comunidad (`cafe_posts` en la base
 * del OS) para Publicaciones relevantes y la Corriente cultural, en UNA lectura compartida
 * (misma clave `cafe:publicaciones` para los dos widgets) cada ≥ 5 min y solo a la vista.
 *
 * Antes cada widget pedía filas + un `count: exact` y re-leía TODO en cada cambio por realtime
 * (dos canales). Ahora: una consulta con columnas justas; si la base responde 400 por una columna
 * que no tiene (`recipe`/`col`, 42703), se sigue con las columnas de siempre el resto de la sesión.
 * Reacciones y comentarios salen de `recipe` (lo mismo que pinta el Café); nada se deriva ni se
 * inventa: sin señales, cero.
 */
import { createClient } from "@/utils/supabase/client";
import { falloDe, type FalloConsulta } from "@/lib/network/bucle-fondo";
import { normalizeCafePost, type CafePostRow, type PostMedia } from "@/lib/social-posts";
import { msDe } from "./formato";

export const COLUMNAS_CAFE = "id, kind, branch, title, body, author_name, created_at, col, recipe";
export const COLUMNAS_CAFE_BASICAS = "id, kind, branch, title, body, author_name, created_at";
export const LIMITE_CAFE = 24;

let columnas = COLUMNAS_CAFE;

export interface CreacionCafe {
    id: string;
    autor: string;
    avatar: string | null;
    titulo: string | null;
    texto: string;
    tipo: string;
    rama: string | null;
    acento: string | null;
    media: string | null;
    tipoMedia: "imagen" | "video" | "enlace" | "archivo" | null;
    nMedia: number;
    reacciones: number;
    comentarios: number;
    etiquetas: string[];
    ms: number;
}

/** Miniatura de un medio del Café (PURO). */
export function mediaCafe(m: PostMedia | null): { url: string | null; tipo: CreacionCafe["tipoMedia"]; n: number } {
    if (!m) return { url: null, tipo: null, n: 0 };
    if (m.kind === "gallery") return { url: m.urls?.[0] ?? null, tipo: "imagen", n: m.urls?.length ?? 1 };
    if (m.kind === "image") return { url: m.url ?? null, tipo: "imagen", n: 1 };
    if (m.kind === "video") return { url: m.poster ?? m.url ?? null, tipo: "video", n: 1 };
    if (m.kind === "link") return { url: null, tipo: "enlace", n: 1 };
    if (m.kind === "text") return { url: null, tipo: null, n: 0 };
    return { url: null, tipo: "archivo", n: 1 };
}

export function creacionDeFila(r: CafePostRow): CreacionCafe {
    const n = normalizeCafePost(r);
    const m = mediaCafe(n.media);
    return {
        id: n.id,
        autor: n.authorName,
        avatar: n.avatarUrl ?? null,
        titulo: n.title ?? null,
        texto: n.body,
        tipo: (n.kind || "obra").toLowerCase(),
        rama: r.branch ?? null,
        acento: n.accent ?? null,
        media: m.url,
        tipoMedia: m.tipo,
        nMedia: m.n,
        reacciones: n.likes,
        comentarios: n.commentsCount,
        etiquetas: n.tags ?? [],
        ms: msDe(n.createdAt),
    };
}

export async function cargarCafe(): Promise<{ datos?: CreacionCafe[]; fallo?: FalloConsulta | null }> {
    try {
        const sb = createClient();
        let res = await sb.from("cafe_posts").select(columnas).order("created_at", { ascending: false }).limit(LIMITE_CAFE);
        let fallo = falloDe(res as { error?: unknown; status?: number });
        if (fallo && columnas === COLUMNAS_CAFE && (fallo.code === "42703" || fallo.status === 400)) {
            columnas = COLUMNAS_CAFE_BASICAS;
            res = await sb.from("cafe_posts").select(columnas).order("created_at", { ascending: false }).limit(LIMITE_CAFE);
            fallo = falloDe(res as { error?: unknown; status?: number });
        }
        if (fallo) return { fallo };
        const filas = (res.data as CafePostRow[] | null) ?? [];
        return { datos: filas.map(creacionDeFila) };
    } catch (e) {
        return { fallo: { message: e instanceof Error ? e.message : "sin red" } };
    }
}

/** Para pruebas. */
export function _reiniciarCafeParaPruebas(): void {
    columnas = COLUMNAS_CAFE;
}
