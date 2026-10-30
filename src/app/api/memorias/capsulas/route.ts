// Ruta de la API de las cápsulas de memoria Memvid (MVD1027D): comprueba el actor de la
// sesión y su alcance ANTES de tocar nada, y solo entonces llama al cliente de
// `memvid-cliente.ts` (contrato: architecture/memvid-capsulas.md §4). Al escribir, además
// pone el mismo texto en el índice LEANN del sujeto (LNN1028D2):
// architecture/leann-recuerdo-semantico.md §4.
import { NextRequest, NextResponse } from "next/server";
import {
  sujetoDeParametro, estado, poner, buscar, type ResultadoPoner,
} from "@/lib/memorias/memvid-cliente";
import { nombreIndiceDe, ponerLeann } from "@/lib/memorias/leann-cliente";
import { alcanceDe, capsulaDe, type SujetoMemoria } from "@/lib/memorias/capsulas";
import {
  alcanceVisiblePara, puedeEscribirEn, type ActorMemoria, type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";

const K_DEFECTO = 5;
const K_MAXIMO = 20;

function error(msg: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Escritura doble (LNN1028D2): el mismo texto ya guardado en Memvid va también al índice
 * LEANN del sujeto y alcance. Sin servidor LEANN nada se rompe: la respuesta lo apunta
 * como «pendiente» para la pasada nocturna del contrato §4. */
async function ponerEnLeann(
  sujeto: SujetoMemoria, alcance: AlcanceMemoria, texto: string, escrito: ResultadoPoner,
): Promise<"listo" | "pendiente"> {
  const indice = nombreIndiceDe(sujeto);
  if (!indice) return "pendiente";
  const puesto = await ponerLeann(indice, [{
    texto,
    metadatos: {
      alcance, sujeto: `${sujeto.tipo}:${sujeto.id}`,
      uri: `mv2://${escrito.nombre}#${escrito.frame}`, ts: Date.now(),
    },
  }]);
  return puesto ? "listo" : "pendiente";
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
    const leann = await ponerEnLeann(sujeto, alcance, cuerpo.texto, escrito);
    return NextResponse.json({ ok: true, ...escrito, leann });
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
