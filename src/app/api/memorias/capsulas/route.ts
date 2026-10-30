import "server-only";
/** Ruta con alcance para las cápsulas de memoria Memvid (MVD1027D, 2026-10-27).
 * GET  ?sujeto=tipo:id → estado de la cápsula del trimestre; POST {accion: "poner" |
 * "buscar", sujeto, texto | consulta, k}. Doble guardia antes de tocar nada: actor de
 * sesión vivo y lo que alcanceVisiblePara / puedeEscribirEn le deja ver o escribir
 * (src/lib/nucleo/alcance-memoria.ts). Nunca devuelve claves ni rutas del disco; si el
 * servidor de cápsulas no está, se responde «disponible: false» y nada falla. */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { capsulaDe, type CapsulaMemoria, type SujetoMemoria } from "@/lib/memorias/capsulas";
import { buscar, estado, parsearSujeto, poner } from "@/lib/memorias/memvid-cliente";
import { alcanceVisiblePara, puedeEscribirEn, type ActorMemoria } from "@/lib/nucleo/alcance-memoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const negar = (mensaje: string, status: number) =>
  NextResponse.json({ ok: false, error: mensaje }, { status });

const sinServidor = () =>
  NextResponse.json(
    { ok: false, disponible: false, error: "El servidor de cápsulas no está o no respondió." },
    { status: 503 },
  );

/** El actor de esta sesión: un usuario autenticado; sin sesión o sin Supabase, null. */
async function actorDeLaSesion(): Promise<ActorMemoria | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { tipo: "usuario" } : null;
  } catch { return null; }
}

/** El sujeto de un cuerpo JSON: objeto {tipo, id, grupoId?} o cadena «tipo:id». */
function sujetoDelCuerpo(valor: unknown): SujetoMemoria | null {
  if (typeof valor === "string") return parsearSujeto(valor);
  if (typeof valor !== "object" || valor === null) return null;
  const { tipo, id, grupoId } = valor as Record<string, unknown>;
  const base =
    typeof tipo === "string" && typeof id === "string" ? parsearSujeto(`${tipo}:${id}`) : null;
  if (!base) return null;
  if (grupoId === undefined) return base;
  return typeof grupoId === "string" && grupoId.trim().length > 0 ? { ...base, grupoId } : base;
}

/** Cápsula del trimestre en curso para el sujeto; sujeto inútil → null. */
function capsulaPartida(sujeto: SujetoMemoria): CapsulaMemoria | null {
  try { return capsulaDe(sujeto, new Date()); } catch { return null; }
}


export async function GET(peticionCli: NextRequest): Promise<Response> {
  const actor = await actorDeLaSesion();
  if (!actor) return negar("Necesitas iniciar sesión.", 401);
  const sujeto = parsearSujeto(peticionCli.nextUrl.searchParams.get("sujeto"));
  if (!sujeto) return negar("Falta el sujeto con formato tipo:id.", 400);
  const capsula = capsulaPartida(sujeto); if (!capsula) return negar("El sujeto no sirve para nombrar una cápsula.", 400);
  if (!alcanceVisiblePara(actor).includes(capsula.alcance)) {
    return negar("Ese alcance de memoria no es visible para tu sesión.", 403);
  }
  const estadoReal = await estado(capsula.nombre);
  return NextResponse.json(
    {
      sujeto,
      capsula: {
        nombre: capsula.nombre,
        alcance: capsula.alcance,
        cifrada: capsula.cifrada,
        periodo: capsula.periodo,
        parte: capsula.parte,
      },
      disponible: estadoReal !== null,
      estado: estadoReal,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(peticionCli: NextRequest): Promise<Response> {
  const actor = await actorDeLaSesion();
  if (!actor) return negar("Necesitas iniciar sesión.", 401);
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await peticionCli.json()) as Record<string, unknown>;
  } catch {
    return negar("El cuerpo no es JSON.", 400);
  }
  const sujeto = sujetoDelCuerpo(cuerpo.sujeto);
  if (!sujeto) return negar("Falta un sujeto válido {tipo, id}.", 400);
  const capsula = capsulaPartida(sujeto); if (!capsula) return negar("El sujeto no sirve para nombrar una cápsula.", 400);

  if (cuerpo.accion === "poner") {
    const texto = typeof cuerpo.texto === "string" ? cuerpo.texto : "";
    if (!texto.trim()) return negar("Falta el texto del recuerdo.", 400);
    if (!puedeEscribirEn(actor, capsula.alcance)) return negar("No puedes escribir en esta memoria.", 403);
    const resultado = await poner(sujeto, texto);
    if (!resultado) return sinServidor();
    return NextResponse.json({ ...resultado }, { headers: { "Cache-Control": "no-store" } });
  }

  if (cuerpo.accion === "buscar") {
    const consulta = typeof cuerpo.consulta === "string" ? cuerpo.consulta : "";
    if (!consulta.trim()) return negar("Falta la consulta a buscar.", 400);
    if (!alcanceVisiblePara(actor).includes(capsula.alcance)) {
      return negar("Ese alcance de memoria no es visible para tu sesión.", 403);
    }
    const k = typeof cuerpo.k === "number" && Number.isInteger(cuerpo.k) && cuerpo.k > 0
      ? Math.min(cuerpo.k, 50) : 5;
    const aciertos = await buscar(capsula.nombre, consulta, k);
    if (!aciertos) return sinServidor();
    return NextResponse.json(
      { ok: true, nombre: capsula.nombre, aciertos },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return negar("Acción no admitida: «poner» o «buscar».", 400);
}


