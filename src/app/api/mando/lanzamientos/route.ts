import os from "node:os";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { filasDeMedios, validarPeticion } from "@/lib/mando/lanzamientos";
import { NATIVE_VERSION } from "@/lib/version/os-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rutaEstado(): string {
  return path.join(os.homedir(), ".starseed", "produccion", "lanzamientos-estado.json");
}
function rutaLanzamientos(): string {
  return path.join(os.homedir(), ".starseed", "produccion", "lanzamientos.json");
}
function rutaPeticion(): string {
  return path.join(os.homedir(), ".starseed", "produccion", "lanzamientos-peticion.json");
}
function rutaAutopublicarPeticion(): string {
  return path.join(os.homedir(), ".starseed", "produccion", "autopublicar-peticion.json");
}
function rutaConfig(): string {
  return path.join(raizDelProyecto(), "config", "lanzamientos.json");
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function leerJson(ruta: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(ruta, "utf-8"));
  } catch {
    return null;
  }
}

async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
  await mkdir(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
  await rename(tmp, ruta);
}

const estadoVacio = () => ({
  fase: "",
  detalle: "",
  version: "",
  pasos: [],
  jobs: [],
  medios: {},
  historial: [],
  pausado: false,
  tono: "normal",
});

export async function GET(req: Request): Promise<Response> {
  const veto = await guardianMando(req);
  if (veto) return veto;

  const [crudoEstado, crudoLanz, crudoConfig] = await Promise.all([
    leerJson(rutaEstado()),
    leerJson(rutaLanzamientos()),
    leerJson(rutaConfig()),
  ]);

  const estado = esObjeto(crudoEstado) ? crudoEstado : estadoVacio();
  const autoPorDefecto = esObjeto(crudoConfig) && crudoConfig.auto_por_defecto === true;
  const auto = esObjeto(crudoLanz) && typeof crudoLanz.auto === "boolean" ? crudoLanz.auto : autoPorDefecto;

  const filas = filasDeMedios(estado as any, NATIVE_VERSION);

  return Response.json(
    { estado, auto, filas },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request): Promise<Response> {
  const veto = await guardianMando(req);
  if (veto) return veto;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const validado = validarPeticion(cuerpo);
  if ("error" in validado) {
    return Response.json({ error: validado.error }, { status: 400 });
  }

  const peticion = validado as any;
  const ahora = new Date().toISOString();

  try {
    if (peticion.accion === "auto") {
      await escribirAtomico(rutaLanzamientos(), { auto: peticion.activo });
    } else if (peticion.accion === "regenerar" && peticion.medio === "web") {
      await escribirAtomico(rutaAutopublicarPeticion(), { accion: "revisar" });
    } else {
      await escribirAtomico(rutaPeticion(), peticion);
    }
  } catch {
    return Response.json({ error: "No se pudo guardar la petición" }, { status: 500 });
  }

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
