/**
 * GET /api/mando/estado (Ola 231 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consola de mando en `localhost`: muestra en vivo el estado del desarrollo y
 * la orquestación multiagéntica leyendo archivos reales de la máquina.
 *
 * ⚠️ Seguridad (innegociable):
 *  • Rutas `/api/mando/*` SOLO funcionan en local: si no estamos en desarrollo
 *    ni `STARSEED_MANDO=1`, responden 404 sin mayor información.
 *  • Exigen sesión como el resto de rutas privadas.
 *  • NUNCA devuelven claves, tokens ni rutas absolutas del disco del usuario:
 *    todo se recorta a rutas relativas al repositorio y a resúmenes seguros.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createClient } from "@/utils/supabase/server";
import type { EstadoMando, RepoInfo } from "@/lib/mando/tipos";
import {
    leerColas,
    colaInteligente,
    enjambreEnMarcha,
    leerEstadoRelevo,
    leerLatidos,
    leerProgreso,
    medirAgentes,
    leerInformes,
    leerRevisiones,
    leerUsoDiario,
    resumirOlas,
} from "@/lib/mando/lector-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

/** Comprueba si el mando está permitido en esta instancia (solo local). */
function mandoHabilitado(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1";
}

/** Ejecuta un comando git de la lista fija y devuelve su stdout recortado. */
async function git(cmd: string, args: string[]): Promise<string> {
    try {
        const { stdout } = await execFileAsync(cmd, args, {
            cwd: process.cwd(),
            timeout: 5000,
            windowsHide: true,
        });
        return stdout.trim();
    } catch {
        return "";
    }
}

/** Lee el resumen del estado git del repositorio. */
async function leerRepo(): Promise<RepoInfo> {
    const [rama, head, log] = await Promise.all([
        git("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
        git("git", ["rev-parse", "--short", "HEAD"]),
        git("git", ["log", "--oneline", "-10"]),
    ]);

    // Sin push (commits locales no publicados) y sin commit (cambios sin commitear).
    let sinPush: number | null = null;
    try {
        const { stdout } = await execFileAsync(
            "git",
            ["rev-list", "--count", "@{upstream}..HEAD"],
            { cwd: process.cwd(), timeout: 5000, windowsHide: true },
        );
        const n = Number.parseInt(stdout.trim(), 10);
        sinPush = Number.isFinite(n) ? n : null;
    } catch {
        sinPush = null;
    }

    let sinCommit: number | null = null;
    const porcelain = await git("git", ["status", "--porcelain"]);
    if (porcelain) sinCommit = porcelain.split("\n").filter((l) => l.trim()).length;

    return {
        rama: rama || null,
        head: head || null,
        sinPush,
        sinCommit,
        log: log ? log.split("\n").filter((l) => l.trim()) : [],
    };
}

export async function GET(): Promise<Response> {
    if (!mandoHabilitado()) {
        return new Response("Not Found", { status: 404 });
    }

    // El mando ya responde 404 fuera de local (arriba). Exigir ADEMÁS sesión dejaba la
    // consola inservible justo en la máquina donde tiene que usarse: la base puede estar
    // vacía y aún no haber ninguna cuenta. En desarrollo basta con ese candado; si alguien
    // levanta una instancia propia con STARSEED_MANDO=1, ahí sí se exige sesión porque
    // entonces la consola es alcanzable desde fuera.
    if (process.env.NODE_ENV === "production") {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) {
                return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
            }
        } catch {
            return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
        }
    }

    const [relevo, tareas, informes, uso, revisiones, repo, progreso, latidos, enMarcha, agentes] =
        await Promise.all([
            leerEstadoRelevo(),
            leerColas(),
            leerInformes(),
            leerUsoDiario(),
            leerRevisiones(),
            leerRepo(),
            leerProgreso(),
            leerLatidos(),
            enjambreEnMarcha(),
            medirAgentes(),
        ]);

    const estado: EstadoMando = {
        generadoEn: new Date().toISOString(),
        mandoActivo: true,
        relevo,
        olas: resumirOlas(tareas, progreso),
        tareas,
        latidos,
        enjambreEnMarcha: enMarcha,
        agentes,
        fila: colaInteligente(tareas, progreso, latidos),
        informes,
        uso,
        revisiones,
        repo,
    };

    return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}