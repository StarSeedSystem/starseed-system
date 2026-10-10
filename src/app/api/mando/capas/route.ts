/**
 * /api/mando/capas (Ola 1007D · Capas autoadaptables de Astraura)
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestor de capas Astraura para la pestaña «Capas» del Mando (Genesis).
 *
 * GET  → el estado actual combinado de todas las capas (catalogo, estado, espejos,
 *        dispositivos, servidores, resultados del banco) y la lista de capas.
 * POST → { accion: "comprobar" | "banco", ... } lanza una pasada del renovador o del banco,
 *        desacoplada, según el patrón de `lanzarPasadaAutopublicar` de `/api/mando/produccion`.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * local, solo local; localhost sin sesión (Ola 254 · 2026-09-06).
 * NUNCA devuelve claves, tokens ni rutas del disco.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { extraerFilasCapaRed } from "@/lib/mando/capas-red";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function cargarCatalogo(): Promise<unknown> {
  try {
    const fs = await import("node:fs/promises");
    const configPath = path.join(raizDelProyecto(), "config", "capas-astraura.json");
    const contenido = await fs.readFile(configPath, "utf-8");
    return JSON.parse(contenido);
  } catch {
    return null;
  }
}

async function cargarEstado(): Promise<unknown> {
  try {
    const fs = await import("node:fs/promises");
    const estadoPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".starseed", "capas-estado.json");
    const contenido = await fs.readFile(estadoPath, "utf-8");
    return JSON.parse(contenido);
  } catch {
    return null;
  }
}

async function cargarChips(): Promise<unknown> {
  try {
    const fs = await import("node:fs/promises");
    const chipsPath = path.join(raizDelProyecto(), "src", "lib", "mando", "fichas-capacidades.json");
    const contenido = await fs.readFile(chipsPath, "utf-8");
    return JSON.parse(contenido);
  } catch {
    return null;
  }
}

async function cargarResultadosBanco(): Promise<unknown> {
  try {
    const fs = await import("node:fs/promises");
    const resultadosPath = path.join(raizDelProyecto(), "src", "lib", "mando", "resultados-banco.json");
    const contenido = await fs.readFile(resultadosPath, "utf-8");
    return JSON.parse(contenido);
  } catch {
    return null;
  }
}

async function lanzarPasada(script: string, args: string[] = []): Promise<void> {
  try {
    const python = existsSync("/opt/homebrew/bin/python3") ? "/opt/homebrew/bin/python3" : "python3";
    const hijo = spawn(python, [path.join(raizDelProyecto(), "scripts", "puente", script), ...args], {
      cwd: raizDelProyecto(),
      detached: true,
      stdio: "ignore",
    });
    hijo.unref();
  } catch {
    /* el servicio lo hará en su próxima vuelta (≤ 5 min) */
  }
}

export async function GET(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;

  const [catalogo, estado, chips, resultadosBanco] = await Promise.all([
    cargarCatalogo(),
    cargarEstado(),
    cargarChips(),
    cargarResultadosBanco(),
  ]);

  const filas = extraerFilasCapaRed(
    catalogo as { capas: Array<{ id: string; version: string; estado: string }>; espejos: Record<string, boolean> },
    estado as { actualizado: string; capas: Record<string, { dispositivos: number; servidores: number; ultima: string }> },
    chips as { capa: string; chips: Record<string, { nodoId: string; capas?: string[] }> }[],
    resultadosBanco as { capa: string; version: string; resultado: string }[],
  );

  const capas = filas.map((f) => ({
    id: f.id,
    capa: f.capa,
    version: f.version,
    estado: f.estado,
    dispositivos: f.dispositivos,
    servidores: f.servidores,
    espejos: f.espejos,
    resultadoBanco: f.resultadoBanco,
  }));

  return Response.json(
    {
      capas,
      filas,
      actualizadoEn: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;

  let cuerpo: Record<string, unknown>;
  try {
    const crudo = (await peticion.json()) as unknown;
    if (!crudo || typeof crudo !== "object") throw new Error("no-objeto");
    cuerpo = crudo as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";

  if (accion === "comprobar") {
    await lanzarPasada("capas_renovar.py", ["--json"]);
    return Response.json(
      { ok: true, accion, mensaje: "El renovador de capas se lanzó en segundo plano." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (accion === "banco") {
    await lanzarPasada("capas_banco.py");
    return Response.json(
      { ok: true, accion, mensaje: "El banco de capas se lanzó en segundo plano." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json({ error: "Acción desconocida: usa comprobar o banco." }, { status: 400 });
}
