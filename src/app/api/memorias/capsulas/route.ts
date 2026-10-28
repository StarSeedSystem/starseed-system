/**
 * GET/POST /api/memorias/capsulas (MVD1027D · 2026-10-28)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cápsulas Memvid del sujeto (`architecture/memvid-capsulas.md` §4). El cliente
 * del servidor local vive en `src/lib/memorias/memvid-cliente.ts`.
 * ⚠️ Antes de tocar una cápsula se comprueba el actor de la sesión con
 * `puedeEscribirEn` / `alcanceVisiblePara`; nunca se devuelven tokens ni rutas.
 */
import { createClient } from "@/utils/supabase/server";
import { capsulaDe, type CapsulaMemoria, type SujetoMemoria, type TipoSujeto } from "@/lib/memorias/capsulas";
import { alcanceVisiblePara, puedeEscribirEn, type ActorMemoria, type TipoActor } from "@/lib/nucleo/alcance-memoria";
import { clienteMemvid } from "@/lib/memorias/memvid-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: readonly string[] = ["perfil", "personalidad", "agente", "bot", "pagina", "grupo", "comunidad", "cerebro", "capa"];
const ACTORES: readonly string[] = ["usuario", "agente-personal", "agente-grupo", "agente-publico"];
const SIN_CACHE = { "Cache-Control": "no-store" };
const TOPE_TEXTO = 20_000;
const TOPE_CONSULTA = 500;

const error = (mensaje: string, status: number) => Response.json({ error: mensaje }, { status, headers: SIN_CACHE });

function parseSujeto(valor: unknown, grupo: unknown): SujetoMemoria | null {
  if (typeof valor !== "string") return null;
  const corte = valor.indexOf(":");
  const tipo = corte > 0 ? valor.slice(0, corte) : "";
  const id = corte > 0 ? valor.slice(corte + 1).trim() : "";
  if (!id || !TIPOS.includes(tipo)) return null;
  const grupoId = typeof grupo === "string" && grupo.trim() ? grupo.trim() : undefined;
  return grupoId ? { tipo: tipo as TipoSujeto, id, grupoId } : { tipo: tipo as TipoSujeto, id };
}

/** El actor lo declara quien llama; la sesión solo acredita a la persona dueña. */
function parseActor(valor: unknown, grupo: unknown): ActorMemoria {
  const tipo = (typeof valor === "string" && ACTORES.includes(valor) ? valor : "usuario") as TipoActor;
  const grupoId = typeof grupo === "string" && grupo.trim() ? grupo.trim() : undefined;
  return tipo === "agente-grupo" ? { tipo, grupoId } : { tipo };
}

function capsulaSegura(sujeto: SujetoMemoria): CapsulaMemoria | null {
  try { return capsulaDe(sujeto, new Date()); } catch { return null; }
}

async function haySesion(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error: fallo } = await supabase.auth.getUser();
    return !fallo && !!data.user;
  } catch {
    return false;
  }
}

export async function GET(peticion: Request): Promise<Response> {
  if (!(await haySesion())) return error("Necesitas iniciar sesión.", 401);
  const url = new URL(peticion.url), grupo = url.searchParams.get("grupo");
  const sujeto = parseSujeto(url.searchParams.get("sujeto"), grupo);
  if (!sujeto) return error("Falta «sujeto» con la forma tipo:id.", 400);
  const capsula = capsulaSegura(sujeto);
  if (!capsula) return error("«sujeto» no es válido.", 400);
  const actor = parseActor(url.searchParams.get("actor"), grupo);
  if (!alcanceVisiblePara(actor).includes(capsula.alcance)) return error("Ese alcance no es visible para este actor.", 403);
  const cliente = clienteMemvid(), capsulas: unknown[] = [];
  for (let parte = 1; parte <= 26; parte++) {
    const estado = await cliente.estado(sujeto, { parte });
    if (!estado) break;
    capsulas.push({ ...estado, parte, alcance: capsula.alcance, cifrada: capsula.cifrada });
  }
  return Response.json({ sujeto, capsulas, servidor: await cliente.salud() }, { headers: SIN_CACHE });
}

export async function POST(peticion: Request): Promise<Response> {
  if (!(await haySesion())) return error("Necesitas iniciar sesión.", 401);
  let cuerpo: Record<string, unknown>;
  try {
    const leido: unknown = await peticion.json();
    if (typeof leido !== "object" || leido === null || Array.isArray(leido)) throw new Error("no es objeto");
    cuerpo = leido as Record<string, unknown>;
  } catch { return error("Cuerpo JSON inválido.", 400); }
  const sujeto = parseSujeto(cuerpo.sujeto, cuerpo.grupoId);
  if (!sujeto) return error("«sujeto» debe tener la forma tipo:id.", 400);
  const capsula = capsulaSegura(sujeto);
  if (!capsula) return error("«sujeto» no es válido.", 400);
  const actor = parseActor(cuerpo.actor, cuerpo.grupoId), cliente = clienteMemvid();

  if (cuerpo.accion === "poner") {
    if (!puedeEscribirEn(actor, capsula.alcance)) return error("No puedes escribir en ese alcance.", 403);
    const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
    if (!texto) return error("Falta «texto».", 400);
    if (texto.length > TOPE_TEXTO) return error("«texto» es demasiado largo.", 413);
    const puesto = await cliente.poner(sujeto, texto, {
      titulo: typeof cuerpo.titulo === "string" ? cuerpo.titulo.slice(0, 200) : undefined,
      uri: typeof cuerpo.uri === "string" ? cuerpo.uri.slice(0, 500) : undefined,
    });
    if (!puesto) return error("El servidor de cápsulas no responde.", 503);
    return Response.json({ ...puesto, alcance: capsula.alcance, cifrada: capsula.cifrada }, { headers: SIN_CACHE });
  }

  if (cuerpo.accion === "buscar") {
    if (!alcanceVisiblePara(actor).includes(capsula.alcance)) return error("Ese alcance no es visible para este actor.", 403);
    const consulta = typeof cuerpo.consulta === "string" ? cuerpo.consulta.trim() : "";
    if (!consulta) return error("Falta «consulta».", 400);
    if (consulta.length > TOPE_CONSULTA) return error("«consulta» es demasiado larga.", 413);
    const k = typeof cuerpo.k === "number" && Number.isFinite(cuerpo.k) ? Math.max(1, Math.min(50, Math.trunc(cuerpo.k))) : 5;
    const aciertos = await cliente.buscar(sujeto, consulta, k);
    if (!aciertos) return error("El servidor de cápsulas no responde.", 503);
    return Response.json({ aciertos, alcance: capsula.alcance }, { headers: SIN_CACHE });
  }
  return error("«accion» debe ser «poner» o «buscar».", 400);
}
