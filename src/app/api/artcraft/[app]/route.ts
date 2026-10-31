/**
 * /api/artcraft/[app] — pasarela ArtCraft de ESTA neurona (solo servidor).
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → { instalado, version, donde } de <app>-cli.
 * POST { herramienta, parametros, contexto[, origen, ambito, rol] } ≤ 1 MB →
 *      { ok, resultado?, motivo?, confirmar?, sinRed? } de la herramienta MCP.
 * `app` solo del conjunto de las Craft Apps (404 si no). Puerta: el guardián de
 * Genesis (404 en producción). Como mucho 1 MB de cuerpo. La lógica vive en
 * `src/lib/artcraft/pasarela-servidor.ts`; el contrato, `architecture/artcraft-y-rare.md` §3.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { createClient } from "@/utils/supabase/server";
import { esAmbito, ROLES, type Ambito, type Rol } from "@/lib/protomolecula/tipos";
import { APPS_ARTCRAFT, type AppArtcraft } from "@/lib/artcraft/politica-tablas";
import { estadoArtcraft, llamarArtcraft } from "@/lib/artcraft/pasarela-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
/** Como mucho 1 MB de cuerpo (parámetros de la herramienta, no archivos). */
const MAX_CUERPO = 1024 * 1024;
const esApp = (x: string): x is AppArtcraft => (APPS_ARTCRAFT as readonly string[]).includes(x);
const esRol = (x: unknown): x is Rol => typeof x === "string" && (ROLES as readonly string[]).includes(x);

interface CuerpoPost {
    herramienta?: unknown;
    parametros?: unknown;
    contexto?: unknown;
    origen?: unknown;
    ambito?: unknown;
    rol?: unknown;
}

async function appDe(params: Promise<{ app: string }>): Promise<AppArtcraft | null> {
    const { app } = await params;
    return esApp(app) ? app : null;
}

/** ¿Hay sesión de persona real? (para permitir `origen: "mano"`). */
async function hayPersona(): Promise<boolean> {
    try {
        const { data } = await (await createClient()).auth.getUser();
        return !!data.user;
    } catch {
        return false;
    }
}

export async function GET(request: Request, ctx: { params: Promise<{ app: string }> }): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const app = await appDe(ctx.params);
    if (!app) return Response.json({ ok: false, motivo: "App de ArtCraft desconocida." }, { status: 404, headers: SIN_CACHE });
    const est = await estadoArtcraft(app);
    return Response.json({ app, instalado: est.instalado, version: est.version, donde: est.donde }, { headers: SIN_CACHE });
}

export async function POST(request: Request, ctx: { params: Promise<{ app: string }> }): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const app = await appDe(ctx.params);
    if (!app) return Response.json({ ok: false, motivo: "App de ArtCraft desconocida." }, { status: 404, headers: SIN_CACHE });
    const largo = Number(request.headers.get("content-length") ?? 0);
    const cuerpo: string = await request.text().catch(() => "");
    if (largo > MAX_CUERPO || cuerpo.length > MAX_CUERPO) {
        return Response.json({ ok: false, motivo: "El cuerpo pasa de 1 MB: los archivos van por la carpeta de trabajo, no por aquí." }, { status: 413, headers: SIN_CACHE });
    }
    let c: CuerpoPost;
    try {
        c = JSON.parse(cuerpo) as CuerpoPost;
    } catch {
        return Response.json({ ok: false, motivo: "Se esperaba un JSON con herramienta, parametros y contexto." }, { status: 400, headers: SIN_CACHE });
    }
    const parametros = c.parametros !== null && typeof c.parametros === "object" && !Array.isArray(c.parametros) ? (c.parametros as Record<string, unknown>) : null;
    if (typeof c.herramienta !== "string" || !c.herramienta || !parametros || typeof c.contexto !== "string") {
        return Response.json({ ok: false, motivo: "Faltan herramienta, parametros (objeto) o contexto." }, { status: 400, headers: SIN_CACHE });
    }
    const manoPedida = c.origen === "mano" && (await hayPersona());
    const r = await llamarArtcraft({
        app,
        herramienta: c.herramienta,
        parametros,
        origen: manoPedida ? "mano" : "agente",
        ambito: esAmbito(c.ambito) ? (c.ambito as Ambito) : "personal",
        rol: esRol(c.rol) ? c.rol : null,
        contexto: c.contexto,
    });
    if (!r.ok) {
        return Response.json({ ok: false, motivo: r.motivo ?? "No se pudo llamar a la herramienta.", confirmar: r.confirmar ?? false, sinRed: r.sinRed ?? null }, { status: r.status ?? 500, headers: SIN_CACHE });
    }
    return Response.json({ ok: true, resultado: r.resultado, ms: r.ms, sinRed: r.sinRed }, { headers: SIN_CACHE });
}
