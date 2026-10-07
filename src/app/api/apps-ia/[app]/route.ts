/** POST /api/apps-ia/[app] — publicación compatible con chat-messages de Dify. */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  claveAppAceptada,
  idAppValido,
  validarPeticionAppIa,
  type PeticionAppIa,
} from "@/lib/mando/apps-ia";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ app: string }> };

async function configuracion(app: string): Promise<Record<string, unknown> | null> {
  try {
    const ruta = path.join(raizDelProyecto(), "starseed_memory_root", "apps-ia", `${app}.json`);
    return JSON.parse(await readFile(ruta, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function ejecutar(app: string, cuerpo: PeticionAppIa): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const raiz = raizDelProyecto();
    const guion = path.join(raiz, "scripts", "puente", "apps_ia.py");
    const hijo = spawn("python3", [guion, app], { cwd: raiz });
    let salida = "";
    let fallo = "";
    const limite = setTimeout(() => {
      hijo.kill("SIGKILL");
      reject(new Error("La app de IA excedió el tiempo máximo."));
    }, 130_000);
    hijo.stdout.setEncoding("utf8");
    hijo.stderr.setEncoding("utf8");
    hijo.stdout.on("data", (trozo: string) => {
      salida += trozo;
      if (salida.length > 2_000_000) hijo.kill("SIGKILL");
    });
    hijo.stderr.on("data", (trozo: string) => { fallo += trozo; });
    hijo.on("error", (error: Error) => {
      clearTimeout(limite);
      reject(error);
    });
    hijo.on("close", (codigo: number | null) => {
      clearTimeout(limite);
      try {
        const datos = JSON.parse(salida || "{}") as { error?: string };
        if (codigo !== 0) reject(new Error(datos.error || fallo || "Falló el modelo."));
        else resolve(datos);
      } catch {
        reject(new Error("La app de IA devolvió una respuesta ilegible."));
      }
    });
    hijo.stdin.end(JSON.stringify(cuerpo));
  });
}

export async function POST(req: Request, contexto: Contexto): Promise<Response> {
  const { app } = await contexto.params;
  if (!idAppValido(app)) return new Response("Not Found", { status: 404 });
  const cfg = await configuracion(app);
  if (!cfg) return new Response("Not Found", { status: 404 });
  const variableClave = cfg.clave_env ?? cfg.api_key_env;
  if (!claveAppAceptada(req.headers.get("authorization"), variableClave, process.env)) {
    return new Response("Not Found", { status: 404 });
  }
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const error = validarPeticionAppIa(cuerpo);
  if (error) return Response.json({ error }, { status: 400 });
  try {
    return Response.json(await ejecutar(app, cuerpo as PeticionAppIa));
  } catch {
    return Response.json({ error: "La app de IA no pudo responder." }, { status: 502 });
  }
}
