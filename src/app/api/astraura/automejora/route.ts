/**
 * `/api/astraura/automejora` (MTN1027K · `architecture/automejora-meta-n.md` §3 y §5)
 * Ruta SOLO LOCAL (guardián de las rutas locales de Genesis: 404 en producción
 * desplegada; jamás devuelve claves ni rutas del disco).
 *
 * GET  → config (`~/.starseed/automejora.json`), la última noche
 *        (`starseed_memory_root/aprendizaje/automejora/ultima-noche.json`) y directivas
 *        (`starseed_memory_root/aprendizaje/directivas/*.json`). Fuera de la Mac responde
 *        vacío, sin error. POST → `{capa, accion: encender|apagar|volver|aportar|preguntar,
 *        valor?}`: escribe la config; «volver» reactiva la anterior en directivas.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ACCIONES,
  aplicarAccion,
  normalizarConfigAutomejora,
  normalizarNocheAutomejora,
  type AccionAutomejora,
  type ConfigAutomejora,
} from "@/lib/astraura/capas/automejora";
import { volverALaAnterior } from "@/lib/astraura/capas/directivas";
import { normalizarArchivoDirectivas, normalizarRegistroDirectivas } from "@/lib/astraura/capas/directivas-almacen";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rutaConfig = (): string => path.join(os.homedir(), ".starseed", "automejora.json");
const carpetaDirectivas = (): string =>
  path.join(raizDelProyecto(), "starseed_memory_root", "aprendizaje", "directivas");
const rutaNoche = (): string =>
  path.join(raizDelProyecto(), "starseed_memory_root", "aprendizaje", "automejora", "ultima-noche.json");

async function leerJson(ruta: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

async function leerDirectivas(): Promise<Record<string, unknown>> {
  try {
    const nombres = (await readdir(carpetaDirectivas())).filter((n) => n.endsWith(".json"));
    const crudos = await Promise.all(nombres.map((n) => leerJson(path.join(carpetaDirectivas(), n))));
    return Object.fromEntries(nombres.map((n, i) => [n.replace(/\.json$/, ""), crudos[i]]));
  } catch {
    return {};
  }
}

async function escribirJson(ruta: string, datos: unknown): Promise<boolean> {
  try {
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, JSON.stringify(datos, null, 2) + "\n", "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function GET(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;
  const [crudoConfig, crudoNoche, crudoDirectivas] = await Promise.all([
    leerJson(rutaConfig()),
    leerJson(rutaNoche()),
    leerDirectivas(),
  ]);
  return Response.json(
    {
      config: normalizarConfigAutomejora(crudoConfig),
      noche: normalizarNocheAutomejora(crudoNoche),
      directivas: normalizarRegistroDirectivas(crudoDirectivas),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;
  let capa = "";
  let accion = "";
  let valor: unknown;
  try {
    const cuerpo = (await peticion.json()) as Record<string, unknown>;
    if (typeof cuerpo.capa === "string") capa = cuerpo.capa;
    if (typeof cuerpo.accion === "string") accion = cuerpo.accion;
    valor = cuerpo.valor;
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  if (!capa || !ACCIONES.includes(accion as AccionAutomejora)) {
    return Response.json({ error: "Falta la capa o la acción no existe." }, { status: 400 });
  }

  const config = normalizarConfigAutomejora(await leerJson(rutaConfig()));
  if (accion === "volver") {
    const rutaCapa = path.join(carpetaDirectivas(), `${capa}.json`);
    const archivo = normalizarArchivoDirectivas(await leerJson(rutaCapa));
    if (!archivo) return Response.json({ error: "Sin directivas para esa capa." }, { status: 404 });
    const nuevoArchivo = volverALaAnterior(archivo);
    await escribirJson(rutaCapa, nuevoArchivo);
    return Response.json(
      { ok: true, config, directivas: { [capa]: nuevoArchivo } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const nuevaConfig = aplicarAccion(config, capa, accion as AccionAutomejora, valor);
  const escrito = await escribirJson(rutaConfig(), nuevaConfig satisfies ConfigAutomejora);
  return Response.json(
    { ok: escrito, config: nuevaConfig },
    { headers: { "Cache-Control": "no-store" } },
  );
}
