/**
 * GET/POST /api/mando/flujos (FLU1005Hc · 2026-10-08 · Genesis, solo local)
 * ─────────────────────────────────────────────────────────────────────────────
 * Puerta del editor de Flujos de Genesis (contrato §3 de
 * `architecture/puente-propio-flujos.md`). Lee y escribe el JSON de cada flujo en
 * `starseed_memory_root/flujos/`, igual que `scripts/puente/flujos/modelo.py`.
 *
 *   GET  → sin parámetros: `{ flujos:[{id,nombre,nodos,disparador}] }`;
 *          `?flujo=<id>`: el JSON completo;
 *          `?ejecuciones=<id>`: las últimas 20 ejecuciones con entrada y salida
 *          por nodo.
 *   POST → `{ accion: "guardar", flujo }` valida y escribe el flujo;
 *          `{ accion: "ejecutar", id }` deja UNA entrada manual en
 *          `flujos/entrada/` (jamás ejecuta Python desde la ruta);
 *          `{ accion: "activar", id }` confirma que el flujo tiene disparador:
 *          con él, el servicio ya lo recoge (los flujos no tienen interruptor).
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { nombreArchivoEntrada, sanitizarRuta } from "@/lib/mando/gancho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_EJECUCIONES = 20;
const ARCHIVO_ESTADO = "disparadores-estado.json";
const TIPOS_NODO = new Set([
    "webhook", "cron", "bus", "chat",
    "http", "ntfy", "telegram", "chat_director", "ia", "conocimiento",
    "si", "switch", "fusion", "set", "esperar",
]);
const DISPARADORES = new Set(["webhook", "cron", "bus", "chat"]);

function carpetaFlujos(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "flujos");
}

interface NodoCrudo {
    id: string;
    tipo: string;
    configuracion?: Record<string, unknown>;
    reintentos?: number;
    espera_ms?: number;
}

interface FlujoCrudo {
    id: string;
    nombre: string;
    nodos: NodoCrudo[];
    conexiones: Array<{ origen: string; destino: string }>;
    flujo_error?: string | null;
}

async function leerFlujo(id: string): Promise<FlujoCrudo | null> {
    try {
        const crudo = await readFile(path.join(carpetaFlujos(), `${id}.json`), "utf8");
        const datos = JSON.parse(crudo) as FlujoCrudo;
        return datos && typeof datos.id === "string" && Array.isArray(datos.nodos) ? datos : null;
    } catch {
        return null;
    }
}

function errorValidacion(flujo: unknown): string | null {
    if (!flujo || typeof flujo !== "object") return "Falta el flujo.";
    const f = flujo as FlujoCrudo;
    if (!RE_ID.test(String(f.id ?? ""))) return "El id del flujo solo admite letras, dígitos, guion y guion bajo.";
    if (typeof f.nombre !== "string" || !f.nombre.trim()) return "El flujo necesita un nombre.";
    if (!Array.isArray(f.nodos)) return "El flujo necesita una lista de nodos.";
    const ids = new Set<string>();
    for (const nodo of f.nodos) {
        if (!nodo || !RE_ID.test(String(nodo.id ?? ""))) return "Cada nodo necesita un id válido.";
        if (ids.has(nodo.id)) return "Los ids de nodo deben ser únicos.";
        ids.add(nodo.id);
        if (!TIPOS_NODO.has(String(nodo.tipo))) return `Tipo de nodo desconocido: ${String(nodo.tipo)}.`;
        if (typeof nodo.reintentos === "number" && nodo.reintentos < 0) return "Los reintentos no pueden ser negativos.";
        if (typeof nodo.espera_ms === "number" && nodo.espera_ms < 0) return "La espera no puede ser negativa.";
    }
    const conexiones = Array.isArray(f.conexiones) ? f.conexiones : [];
    const salidas = new Map<string, string[]>();
    for (const conexion of conexiones) {
        if (!ids.has(String(conexion.origen)) || !ids.has(String(conexion.destino))) {
            return "Una conexión apunta a un nodo inexistente.";
        }
        salidas.set(conexion.origen, [...(salidas.get(conexion.origen) ?? []), conexion.destino]);
    }
    // Grafo acíclico (los nodos «bucle», de haberlos, se tratan como retroenlace):
    // si el orden topológico no cubre a todos, hay un ciclo.
    const grados = new Map<string, number>([...ids].map((id) => [id, 0]));
    for (const destinos of salidas.values()) {
        for (const destino of destinos) grados.set(destino, (grados.get(destino) ?? 0) + 1);
    }
    const pendientes = [...ids].filter((id) => grados.get(id) === 0);
    let visitados = 0;
    while (pendientes.length > 0) {
        const actual = pendientes.shift() as string;
        visitados += 1;
        for (const destino of salidas.get(actual) ?? []) {
            const grado = (grados.get(destino) ?? 0) - 1;
            grados.set(destino, grado);
            if (grado === 0) pendientes.push(destino);
        }
    }
    if (visitados !== ids.size) return "El flujo contiene un ciclo.";
    return null;
}

function disparadorDe(flujo: FlujoCrudo): { tipo: string; ruta: string | null } | null {
    const nodo = flujo.nodos.find((n) => DISPARADORES.has(String(n.tipo)));
    if (!nodo) return null;
    const ruta = nodo.tipo === "webhook" && nodo.configuracion && typeof nodo.configuracion.ruta === "string"
        ? sanitizarRuta(nodo.configuracion.ruta)
        : null;
    return { tipo: nodo.tipo, ruta };
}

async function listarFlujos(): Promise<Array<{ id: string; nombre: string; nodos: number; disparador: string | null }>> {
    let archivos: string[] = [];
    try {
        archivos = await readdir(carpetaFlujos());
    } catch {
        return [];
    }
    const lista = [];
    for (const archivo of archivos) {
        if (!archivo.endsWith(".json") || archivo === ARCHIVO_ESTADO) continue;
        const id = archivo.slice(0, -".json".length);
        if (!RE_ID.test(id)) continue;
        const flujo = await leerFlujo(id);
        if (!flujo) continue;
        lista.push({
            id: flujo.id,
            nombre: typeof flujo.nombre === "string" ? flujo.nombre : flujo.id,
            nodos: flujo.nodos.length,
            disparador: disparadorDe(flujo)?.tipo ?? null,
        });
    }
    return lista.sort((a, b) => a.id.localeCompare(b.id));
}

async function listarEjecuciones(id: string): Promise<unknown[]> {
    const carpeta = path.join(carpetaFlujos(), "ejecuciones", id);
    let archivos: string[] = [];
    try {
        archivos = await readdir(carpeta);
    } catch {
        return [];
    }
    const recientes = archivos.filter((a) => a.endsWith(".json")).sort().slice(-MAX_EJECUCIONES);
    const ejecuciones = [];
    for (const archivo of recientes) {
        try {
            const datos = JSON.parse(await readFile(path.join(carpeta, archivo), "utf8")) as Record<string, unknown>;
            const nodos: Record<string, unknown> = {};
            if (datos.nodos && typeof datos.nodos === "object") {
                for (const [nid, reg] of Object.entries(datos.nodos as Record<string, unknown>)) {
                    const r = reg && typeof reg === "object" ? reg as Record<string, unknown> : {};
                    nodos[nid] = { entrada: r.entrada ?? [], salida: r.salida ?? [], error: r.error ?? null, ms: r.ms ?? null };
                }
            }
            ejecuciones.push({
                id: datos.id ?? archivo.slice(0, -5),
                estado: datos.estado ?? "desconocido",
                entrada: datos.entrada ?? [],
                salida: datos.salida ?? [],
                error: datos.error ?? null,
                nodos,
            });
        } catch {
            // una ejecución ilegible no frena a las demás
        }
    }
    return ejecuciones.reverse();
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const url = new URL(peticion.url);
    const idFlujo = url.searchParams.get("flujo");
    const idEjecuciones = url.searchParams.get("ejecuciones");
    if (idFlujo) {
        if (!RE_ID.test(idFlujo)) return Response.json({ ok: false, error: "Id de flujo no válido." }, { status: 400 });
        const flujo = await leerFlujo(idFlujo);
        if (!flujo) return Response.json({ ok: false, error: "Flujo no encontrado." }, { status: 404 });
        return Response.json({ ok: true, flujo }, { headers: { "Cache-Control": "no-store" } });
    }
    if (idEjecuciones) {
        if (!RE_ID.test(idEjecuciones)) return Response.json({ ok: false, error: "Id de flujo no válido." }, { status: 400 });
        return Response.json({ ok: true, ejecuciones: await listarEjecuciones(idEjecuciones) }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ ok: true, flujos: await listarFlujos() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ ok: false, error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";

    if (accion === "guardar") {
        const problema = errorValidacion(cuerpo.flujo);
        if (problema) return Response.json({ ok: false, error: problema }, { status: 400 });
        const flujo = cuerpo.flujo as FlujoCrudo;
        await mkdir(carpetaFlujos(), { recursive: true });
        await writeFile(
            path.join(carpetaFlujos(), `${flujo.id}.json`),
            JSON.stringify(flujo, null, 2) + "\n",
            "utf8",
        );
        return Response.json({ ok: true, disparador: disparadorDe(flujo)?.tipo ?? null });
    }

    if (accion === "ejecutar") {
        const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
        if (!RE_ID.test(id)) return Response.json({ ok: false, error: "Id de flujo no válido." }, { status: 400 });
        const flujo = await leerFlujo(id);
        if (!flujo) return Response.json({ ok: false, error: "Flujo no encontrado." }, { status: 404 });
        // La entrada manual llega al motor por la carpeta de gancho: usa la ruta
        // que ya tuviera el flujo, o el propio id si aún no es de webhook.
        const ruta = disparadorDe(flujo)?.ruta ?? id;
        const carpeta = path.join(carpetaFlujos(), "entrada");
        await mkdir(carpeta, { recursive: true });
        await writeFile(
            path.join(carpeta, nombreArchivoEntrada(ruta, Date.now())),
            JSON.stringify({ cuerpo: { disparador: "manual", quien: "editor-genesis" } }, null, 2) + "\n",
            "utf8",
        );
        return Response.json({ ok: true, ruta }, { status: 202 });
    }

    if (accion === "activar") {
        const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
        if (!RE_ID.test(id)) return Response.json({ ok: false, error: "Id de flujo no válido." }, { status: 400 });
        const flujo = await leerFlujo(id);
        if (!flujo) return Response.json({ ok: false, error: "Flujo no encontrado." }, { status: 404 });
        const disparador = disparadorDe(flujo);
        if (!disparador) {
            return Response.json({ ok: false, error: "El flujo necesita un disparador (webhook, cron, bus o chat) para activarse." }, { status: 400 });
        }
        return Response.json({ ok: true, disparador: disparador.tipo });
    }

    return Response.json({ ok: false, error: "Acción no válida: usa guardar, ejecutar o activar." }, { status: 400 });
}
