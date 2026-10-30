// Ruta de la API de las cápsulas de memoria Memvid (MVD1027D): comprueba el actor de la
// sesión y su alcance ANTES de tocar nada, y solo entonces llama al cliente de
// `memvid-cliente.ts` (contrato: architecture/memvid-capsulas.md §4).
import { NextRequest, NextResponse } from "next/server";
import { sujetoDeParametro, estado, poner, buscar } from "@/lib/memorias/memvid-cliente";
import { nombreIndiceLeann, ponerLeann } from "@/lib/memorias/leann-cliente";
import { alcanceDe, capsulaDe } from "@/lib/memorias/capsulas";
import {
  alcanceVisiblePara, puedeEscribirEn, type ActorMemoria,
} from "@/lib/nucleo/alcance-memoria";

const K_DEFECTO = 5;
const K_MAXIMO = 20;

function error(msg: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Actor de la sesión: el usuario dueño ve y escribe en toda su memoria; null sin sesión. */
async function actorDeLaSesion(): Promise<ActorMemoria | null> {
  try {
    const { createClient } = await import("@/utils/supabase/server");
    const { data } = await (await createClient()).auth.getUser();
    return data?.user ? { tipo: "usuario" } : null;
  } catch { return null; }
}

/** Sujeto del cuerpo: string «tipo:id» o {tipo, id}; null si no vale. */
function sujetoDelCuerpo(valor: unknown): ReturnType<typeof sujetoDeParametro> {
  if (typeof valor === "string") return sujetoDeParametro(valor);
  if (typeof valor === "object" && valor !== null) {
    const { tipo, id } = valor as { tipo?: unknown; id?: unknown };
    if (typeof tipo === "string" && typeof id === "string" && id.trim().length > 0)
      return sujetoDeParametro(`${tipo}:${id}`);
  }
  return null;
}

/** GET ?sujeto=tipo:id → fotogramas, bytes, tope y cuánto queda de su cápsula. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = await actorDeLaSesion();
  if (!actor) return error("Sin sesión", 401);
  const sujeto = sujetoDeParametro(req.nextUrl.searchParams.get("sujeto"));
  if (!sujeto) return error("Sujeto no válido: ?sujeto=tipo:id", 400);
  if (!alcanceVisiblePara(actor).includes(alcanceDe(sujeto)))
    return error("Esta cápsula no es visible para tu sesión", 403);
  const s = await estado(sujeto);
  if (!s) return error("Servidor de cápsulas no disponible", 503);
  return NextResponse.json({ ok: true, capsula: capsulaDe(sujeto, new Date()), estado: s });
}

/** POST {accion: «poner» | «buscar», sujeto, texto | consulta, k}. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await actorDeLaSesion();
  if (!actor) return error("Sin sesión", 401);
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo) return error("Cuerpo no válido", 400);
  const sujeto = sujetoDelCuerpo(cuerpo.sujeto);
  if (!sujeto) return error("Sujeto no válido", 400);
  const alcance = alcanceDe(sujeto);
  const visible = alcanceVisiblePara(actor).includes(alcance);
  if (cuerpo.accion === "poner") {
    if (!visible || !puedeEscribirEn(actor, alcance))
      return error("No puedes escribir en esta cápsula", 403);
    if (typeof cuerpo.texto !== "string" || cuerpo.texto.trim().length === 0)
      return error("Falta el texto", 400);
    const escrito = await poner(sujeto, cuerpo.texto);
    if (!escrito) return error("Servidor de cápsulas no disponible", 503);
    // Escritura doble (LNN1028D2): el mismo texto entra en el índice LEANN del sujeto con
    // metadatos de alcance; si el A1 no está, nada se rompe y queda pendiente para la
    // pasada nocturna (architecture/leann-recuerdo-semantico.md §4).
    const uri = `mv2://${escrito.nombre}#${escrito.frame}`;
    const metadatos = {
      alcance, sujeto: `${sujeto.tipo}:${sujeto.id}`, uri, ts: Math.floor(Date.now() / 1000),
    };
    const enLeann = await ponerLeann(nombreIndiceLeann(sujeto), [{ texto: cuerpo.texto, metadatos }]);
    return NextResponse.json({ ok: true, ...escrito, leann: enLeann ? "listo" : "pendiente" });
  }
  if (cuerpo.accion === "buscar") {
    if (!visible) return error("Esta cápsula no es visible para tu sesión", 403);
    if (typeof cuerpo.consulta !== "string" || cuerpo.consulta.trim().length === 0)
      return error("Falta la consulta", 400);
    const k = typeof cuerpo.k === "number" && Number.isInteger(cuerpo.k) && cuerpo.k > 0
      ? Math.min(cuerpo.k, K_MAXIMO) : K_DEFECTO;
    const aciertos = await buscar(sujeto, cuerpo.consulta, k);
    if (!aciertos) return error("Servidor de cápsulas no disponible", 503);
    return NextResponse.json({ ok: true, aciertos });
  }
  return error("Acción no válida: «poner» o «buscar»", 400);
}
