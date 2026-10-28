/**
 * POST /api/genesis/mcp — servidor MCP remoto de Genesis (Ola 1019G · §7 de
 * architecture/genesis-conectores-abiertos.md).
 *
 * `initialize`, `tools/list` y `tools/call` sobre JSON-RPC 2.0. Las herramientas son las
 * NUEVE de `construirHerramientasGenesis` (definiciones, descripciones y esquemas del
 * módulo puro `mcp/herramientas.ts`); esta ruta INYECTA los manejadores reales, que
 * reutilizan las rutas de mando ya existentes en esta misma máquina. El permiso de cada
 * herramienta se declara en su definición; la puerta de la ruta (`guardianMando`) exige
 * local y/o sesión, y el token por ámbito que afina el alcance entra con la tarea de
 * tokens externos (no se aceptan claves ni tokens: solo lo que ya sale de esas rutas).
 */

import { NextRequest, NextResponse } from "next/server";
import { atenderMcp, type PeticionJsonRpc } from "@/lib/genesis/mcp/protocolo";
import { construirHerramientasGenesis, type ManejadoresGenesis } from "@/lib/genesis/mcp/herramientas";
import { guardianMando } from "@/lib/mando/guardian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METODOS = new Set(["initialize", "tools/list", "tools/call"]);

/** Llama a una ruta interna de esta misma Genesis, junto con la sesión de quien pide. */
async function pedirLocal(req: Request, ruta: string, cuerpo?: Record<string, unknown>): Promise<unknown> {
    const cab = new Headers({ "content-type": "application/json" });
    for (const clicave of ["cookie", "authorization"]) {
        const valor = req.headers.get(clicave);
        if (valor) cab.set(clicave, valor);
    }
    try {
        const r = await fetch(new URL(ruta, req.url).toString(), {
            method: cuerpo === undefined ? "GET" : "POST",
            headers: cab,
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
        return (await r.json()) as unknown;
    } catch {
        return null;
    }
}

interface FilaCola { nombre?: unknown; tareas?: unknown }
interface FilaTarea { id?: unknown; titulo?: unknown; estado?: unknown; modelo?: unknown }

/** Aplana las colas a la lista de tareas que declara `tareas_listar` (más nuevas sanas primero). */
function listarTareas(datos: unknown, limite: number): unknown[] {
    const colas = Array.isArray(datos) ? datos : (datos as { colas?: unknown } | null)?.colas;
    if (!Array.isArray(colas)) return [];
    const planas: unknown[] = [];
    for (const de of colas) {
        const entrada = de as FilaCola;
        if (!Array.isArray(entrada.tareas)) continue;
        const nombre = typeof entrada.nombre === "string" ? entrada.nombre : "sin-nombre";
        for (const t of entrada.tareas as unknown[]) {
            const f = t as FilaTarea;
            planas.push({ cola: nombre, id: f.id ?? null, titulo: f.titulo ?? null, estado: f.estado ?? null, modelo: f.modelo ?? null });
        }
    }
    return planas.slice(0, limite);
}

/** Manejadores reales de las herramientas, apoyados en las rutas de mando ya existentes. */
function manejadoresGenesis(req: Request): ManejadoresGenesis {
    return {
        estado: () => pedirLocal(req, "/api/mando/estado"),
        tareas_listar: async (args) => {
            const limite = typeof args.limite === "number" ? args.limite : 20;
            return listarTareas(await pedirLocal(req, "/api/mando/colas"), limite);
        },
        // Encolar = guardar una cola nuEva de una tarea (la aprobadora decide si sale).
        tareas_crear: async (args) => {
            const nombre = `mcp-tarea-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
            const tareas = [{ titulo: args.titulo, prompt: args.prompt ?? "", ficheros: args.ficheros ?? [], depende: args.depende ?? [] }];
            return pedirLocal(req, "/api/mando/colas", { accion: "guardar", nombre, tareas });
        },
        agentes_listar: () => pedirLocal(req, "/api/mando/agentes"),
        medidores: () => pedirLocal(req, "/api/mando/medidores"),
        chat: (args) => pedirLocal(req, "/api/mando/asistente", { mensaje: args.mensaje }),
    };
}

async function atender(req: Request, peticion: unknown): Promise<Response> {
    if (!esPeticionMcp(peticion)) return NextResponse.json({ jsonrpc: "2.0", error: { code: -32600, message: "Solicitud inválida" } });
    const herramientas = construirHerramientasGenesis(manejadoresGenesis(req));
    return NextResponse.json(await atenderMcp(peticion, { herramientas, contexto: undefined }));
}

function esPeticionMcp(p: unknown): p is PeticionJsonRpc {
    if (typeof p !== "object" || p === null) return false;
    const cuerpo = p as { jsonrpc?: unknown; method?: unknown };
    return cuerpo.jsonrpc === "2.0" && typeof cuerpo.method === "string" && METODOS.has(cuerpo.method);
}

export async function POST(req: NextRequest): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;
    try {
        return await atender(req, await req.json());
    } catch {
        return NextResponse.json({ jsonrpc: "2.0", error: { code: -32700, message: "No se pudo leer el cuerpo." } }, { status: 400 });
    }
}

/** GET ?method=… — mano de control para comprobar el servidor MCP desde Genesis o curl. */
export async function GET(req: NextRequest): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const metodo = req.nextUrl.searchParams.get("method") ?? "initialize";
    if (!METODOS.has(metodo)) {
        return NextResponse.json({ jsonrpc: "2.0", error: { code: -32600, message: `Método «${metodo}» no soportado.` } }, { status: 400 });
    }
    let peticion: PeticionJsonRpc;
    if (metodo === "tools/call") {
        const args = req.nextUrl.searchParams.get("arguments") ?? "{}";
        let argumentos: unknown;
        try { argumentos = JSON.parse(args); } catch { argumentos = {}; }
        peticion = { jsonrpc: "2.0", id: req.nextUrl.searchParams.get("id") ?? "1", method: "tools/call", params: { name: req.nextUrl.searchParams.get("name") ?? "", arguments: argumentos } };
    } else {
        peticion = { jsonrpc: "2.0", id: req.nextUrl.searchParams.get("id") ?? "1", method: metodo };
    }
    return atender(req, peticion);
}
