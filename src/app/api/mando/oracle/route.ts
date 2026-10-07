import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { leerEstadoOracle } from "@/lib/mando/oracle-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rutaEstado() {
  return path.join(os.homedir(), ".starseed", "oracle.json");
}

function lanzarComprobar() {
  try {
    const python = existsSync("/opt/homebrew/bin/python3") ? "/opt/homebrew/bin/python3" : "python3";
    const hijo = spawn(python, [path.join(process.cwd(), "scripts", "puente", "oracle_nube.py"), "comprobar"], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    });
    hijo.unref();
  } catch {
    /* servicio lo hará después */
  }
}

function abrirVincular() {
  try {
    const cmd = 'tell application "Terminal" to do script "oci setup bootstrap"';
    const hijo = spawn("osascript", ["-e", cmd], {
      detached: true,
      stdio: "ignore",
    });
    hijo.unref();
  } catch {
    /* sin Terminal */
  }
}

export async function GET(req: Request) {
  const veto = await guardianMando(req);
  if (veto) return veto;
  try {
    const crudo = await readFile(rutaEstado(), "utf-8");
    const estado = leerEstadoOracle(crudo);
    return Response.json(estado ?? {}, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({}, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: Request) {
  const veto = await guardianMando(req);
  if (veto) return veto;

  let cuerpo: Record<string, unknown>;
  try {
    const crudo = await req.json();
    cuerpo = crudo && typeof crudo === "object" ? crudo as Record<string, unknown> : {};
  } catch {
    return Response.json({ ok: false, error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
  if (accion === "comprobar") {
    lanzarComprobar();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (accion === "vincular") {
    abrirVincular();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  return Response.json({ ok: false, error: "Acción desconocida." }, { status: 400 });
}
