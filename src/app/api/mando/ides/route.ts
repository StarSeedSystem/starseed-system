/**
 * /api/mando/ides (Ola 335 · ID2) — los IDE vinculados y su frescura de contexto.
 *
 * GET  → detalle con la forma de medidor del Mando:
 *        `{ detalle: { clave, titulo, resumen, filas, acciones, vacio }, generadoEn }`.
 * POST { accion: "sincronizar" } → relanza el relevo a todos los IDE
 *        (scripts/puente/sincronizar-ides.py) y devuelve el nuevo estado.
 *
 * Seguridad: misma puerta que el resto del Mando; nunca devuelve rutas absolutas
 * del disco ni claves — el «puntero» se enseña en su forma corta (`~/.codex/…`).
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import { leerEstadoDeIdes, type Ide } from "@/lib/mando/ides";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const correr = promisify(execFile);

/** Puntero de cada IDE en su forma corta y segura: sin `/Users/…` por delante. */
const PUNTERO_CORTO: Record<string, string> = {
    codex: "~/.codex/AGENTS.md",
    hermes: "~/.hermes/PUENTE-DE-MANDO.md",
    antigravity: "~/.gemini/antigravity/PUENTE-DE-MANDO.md",
    "cursor-global": "~/.cursor/rules/puente-de-mando.mdc",
    copilot: "repo/.github/copilot-instructions.md",
    "cursor-local": "repo/.cursor/rules/puente-de-mando.mdc",
};

interface FilaIde {
    id: string;
    titulo: string;
    estado: string;
    porque: string;
    puntero: string;
    acciones: never[];
}

function aDetalle(ides: Ide[]) {
    const alDia = ides.filter((i) => i.frescura === "al día").length;
    const atrasados = ides.filter((i) => i.frescura === "atrasado").length;
    const nunca = ides.filter((i) => i.frescura === "nunca").length;
    const filas: FilaIde[] = ides.map((i) => ({
        id: i.id,
        titulo: i.nombre,
        estado: i.frescura,
        porque: i.nota,
        puntero: PUNTERO_CORTO[i.id] ?? i.id,
        acciones: [],
    }));
    return {
        clave: "ides",
        titulo: "IDEs vinculados",
        resumen: `${alDia} al día · ${atrasados} atrasados · ${nunca} sin vincular`,
        filas,
        acciones: [] as { clase: string; texto: string; destructiva: boolean }[],
        vacio: "Todavía no hay ningún IDE vinculado: lanza «Sincronizar ahora» para repartir el puente.",
    };
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const ides = await leerEstadoDeIdes().catch(() => [] as Ide[]);
    return Response.json(
        { detalle: aDetalle(ides), generadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: { accion?: string };
    try {
        cuerpo = (await peticion.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    if (cuerpo.accion !== "sincronizar") {
        return Response.json({ error: `Acción desconocida: ${cuerpo.accion ?? ""}` }, { status: 400 });
    }

    const raiz = raizDelProyecto();
    try {
        await correr("python3", [path.join(raiz, "scripts", "puente", "sincronizar-ides.py")], {
            cwd: raiz,
            timeout: 60_000,
            maxBuffer: 1_000_000,
        });
    } catch (e) {
        return Response.json(
            { error: `No se pudo lanzar el relevo: ${e instanceof Error ? e.message.slice(0, 200) : "error"}` },
            { status: 500 },
        );
    }

    const ides = await leerEstadoDeIdes().catch(() => [] as Ide[]);
    return Response.json(
        { ok: true, detalle: aDetalle(ides), generadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}
