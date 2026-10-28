// Cápsulas de memoria Memvid (MVD1027D, 2026-10-28). Solo con sesión: el actor se
// comprueba con `alcanceVisiblePara` / `puedeEscribirEn` antes de tocar nada, y la
// respuesta nunca lleva claves, tokens ni rutas del disco.
// GET ?sujeto=tipo:id → estado de sus cápsulas.
// POST { accion: "poner" | "buscar", sujeto, texto | consulta, k }.
import { createClient } from "@/utils/supabase/server";
import {
  alcanceVisiblePara, puedeEscribirEn,
  type ActorMemoria, type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";
import { capsulaDe, type SujetoMemoria } from "@/lib/memorias/capsulas";
import {
  buscar, estado, parsearSujeto, poner,
  type AciertoCapsula, type EstadoCapsula,
} from "@/lib/memorias/memvid-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };
const MAX_PARTES = 26;
const MAX_TEXTO = 20_000;

const error = (mensaje: string, status: number) =>
  Response.json({ ok: false, error: mensaje }, { status, headers: SIN_CACHE });
async function actorDeSesion(): Promise<ActorMemoria | null> {
  try {
    const supabase = await createClient();
    const { data, error: fallo } = await supabase.auth.getUser();
    return !fallo && data.user ? { tipo: "usuario" } : null;
  } catch {
    return null;
  }
}

const sujetoDe = (valor: unknown): SujetoMemoria | null => typeof valor === "string" ? parsearSujeto(valor) : null;
const alcanceDeSujeto = (sujeto: SujetoMemoria): AlcanceMemoria => capsulaDe(sujeto, new Date()).alcance;
const puedeVer = (actor: ActorMemoria, sujeto: SujetoMemoria): boolean => alcanceVisiblePara(actor).includes(alcanceDeSujeto(sujeto));
const puedeEscribir = (actor: ActorMemoria, sujeto: SujetoMemoria): boolean => puedeEscribirEn(actor, alcanceDeSujeto(sujeto));
/** Partes que existen hoy, de la 1 a la última; la primera que falta corta. */
async function partes(sujeto: SujetoMemoria): Promise<EstadoCapsula[]> {
  const fecha = new Date();
  const salida: EstadoCapsula[] = [];
  for (let parte = 1; parte <= MAX_PARTES; parte++) {
    const actual = await estado(capsulaDe(sujeto, fecha, parte).nombre);
    if (!actual) break;
    salida.push(actual);
  }
  return salida;
}

const cuerpoJson = (valor: unknown): Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
export async function GET(request: Request): Promise<Response> {
  const actor = await actorDeSesion();
  if (!actor) return error("Necesitas iniciar sesión.", 401);
  const sujeto = sujetoDe(new URL(request.url).searchParams.get("sujeto"));
  if (!sujeto) return error("El sujeto debe tener la forma tipo:id.", 400);
  if (!puedeVer(actor, sujeto)) return error("No puedes ver esa memoria.", 403);
  const capsulas = await partes(sujeto);
  return Response.json(
    { ok: true, sujeto, alcance: alcanceDeSujeto(sujeto), capsulas },
    { headers: SIN_CACHE },
  );
}

export async function POST(request: Request): Promise<Response> {
  const actor = await actorDeSesion();
  if (!actor) return error("Necesitas iniciar sesión.", 401);
  const tipo = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!tipo.includes("application/json")) return error("Envía el cuerpo como JSON.", 415);
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return error("Cuerpo JSON inválido.", 400);
  }
  const datos = cuerpoJson(cuerpo);
  const sujeto = sujetoDe(datos.sujeto);
  if (!sujeto) return error("El sujeto debe tener la forma tipo:id.", 400);
  if (datos.accion === "poner") {
    if (!puedeEscribir(actor, sujeto)) return error("No puedes escribir en esa memoria.", 403);
    const texto = typeof datos.texto === "string" ? datos.texto.trim() : "";
    if (!texto) return error("Falta el texto que quieres guardar.", 400);
    if (texto.length > MAX_TEXTO) return error("El texto supera el máximo de una escritura.", 413);
    const existentes = await partes(sujeto);
    const ultima = existentes.at(-1);
    const parte = ultima ? (ultima.quedaBytes > 0 ? existentes.length : existentes.length + 1) : 1;
    const titulo = typeof datos.titulo === "string" ? datos.titulo : undefined;
    const resultado = await poner(sujeto, texto, { parte, titulo });
    if (!resultado) return error("El servidor de cápsulas no está disponible.", 503);
    return Response.json({ ok: true, ...resultado }, { headers: SIN_CACHE });
  }
  if (datos.accion === "buscar") {
    if (!puedeVer(actor, sujeto)) return error("No puedes ver esa memoria.", 403);
    const consulta = typeof datos.consulta === "string" ? datos.consulta.trim() : "";
    if (!consulta) return error("Falta la consulta.", 400);
    const k = typeof datos.k === "number" && Number.isFinite(datos.k) ? Math.min(20, Math.max(1, Math.trunc(datos.k))) : 5;
    const existentes = await partes(sujeto);
    if (existentes.length === 0) {
      return Response.json({ ok: true, aciertos: [], capsulas: [] }, { headers: SIN_CACHE });
    }
    const aciertos: AciertoCapsula[] = [];
    let servidorVivo = false;
    for (const capsula of [...existentes].reverse()) {
      if (aciertos.length >= k) break;
      const encontrados = await buscar(capsula.nombre, consulta, k - aciertos.length);
      if (encontrados !== null) servidorVivo = true;
      for (const acierto of encontrados ?? []) {
        if (aciertos.length < k) aciertos.push(acierto);
      }
    }
    if (!servidorVivo && aciertos.length === 0) {
      return error("El servidor de cápsulas no está disponible.", 503);
    }
    return Response.json(
      { ok: true, aciertos, capsulas: existentes.map((c) => c.nombre) },
      { headers: SIN_CACHE },
    );
  }
  return error("Acción desconocida: usa «poner» o «buscar».", 400);
}
