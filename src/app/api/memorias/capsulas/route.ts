import "server-only";
/**
 * API de cápsulas Memvid (MVD1027D)
 * GET ?sujeto=tipo:id -> estado de sus cápsulas
 * POST {accion:"poner"|"buscar", sujeto, texto|consulta, k} con comprobación de actor
 */
import { NextResponse } from "next/server";
import { puedeEscribirEn, alcanceVisiblePara, type ActorMemoria } from "@/lib/nucleo/alcance-memoria";
import { capsulaDe, type TipoSujeto } from "@/lib/memorias/capsulas";
import { buscar, estado, poner } from "@/lib/memorias/memvid-cliente";
import { guardianMando } from "@/lib/mando/guardian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: TipoSujeto[] = ["perfil", "personalidad", "agente", "bot", "pagina", "grupo", "comunidad", "cerebro", "capa"];

function parseSujeto(q: string | null): { tipo: TipoSujeto; id: string } | null {
  if (!q) return null;
  const [tipo, ...rest] = q.split(":");
  if (!TIPOS.includes(tipo as TipoSujeto)) return null;
  const id = rest.join(":");
  if (!id.trim()) return null;
  return { tipo: tipo as TipoSujeto, id: id.trim() };
}

function actorPorTipo(sujeto: { tipo: TipoSujeto; id: string }, grupoId?: string): ActorMemoria {
  if (sujeto.tipo === "perfil") return { tipo: "usuario" };
  if (sujeto.tipo === "agente" || sujeto.tipo === "bot") {
    if (grupoId) return { tipo: "agente-grupo", grupoId };
    return { tipo: "agente-personal" };
  }
  if (sujeto.tipo === "cerebro" || sujeto.tipo === "capa") {
    if (grupoId) return { tipo: "agente-grupo", grupoId };
    return { tipo: "agente-personal" };
  }
  if (sujeto.tipo === "grupo" || sujeto.tipo === "comunidad") return { tipo: "agente-grupo", grupoId: sujeto.id };
  if (sujeto.tipo === "pagina") return { tipo: "agente-publico" };
  return { tipo: "usuario" };
}

function puedeAcceder(actor: ActorMemoria, sujeto: { tipo: TipoSujeto; id: string }, accion: "leer" | "escribir"): boolean {
  if (accion === "leer") {
    const alcance = (() => {
      if (sujeto.tipo === "perfil") return "perfil";
      if (sujeto.tipo === "grupo" || sujeto.tipo === "comunidad") return "grupo";
      if (sujeto.tipo === "pagina") return "publica";
      return "personal";
    })();
    return alcanceVisiblePara(actor).includes(alcance);
  }
  const alcance = (() => {
    if (sujeto.tipo === "perfil") return "perfil" as const;
    if (sujeto.tipo === "grupo" || sujeto.tipo === "comunidad") return "grupo" as const;
    if (sujeto.tipo === "pagina") return "publica" as const;
    return "personal" as const;
  })();
  return puedeEscribirEn(actor, alcance);
}

export async function GET(req: Request): Promise<Response> {
  const veto = await guardianMando(req);
  if (veto) return veto;
  const { searchParams } = new URL(req.url);
  const sujeto = parseSujeto(searchParams.get("sujeto"));
  if (!sujeto) return NextResponse.json({ error: "sujeto inválido" }, { status: 400 });
  const actor = actorPorTipo(sujeto);
  if (!puedeAcceder(actor, sujeto, "leer")) return NextResponse.json({ error: "sin permiso" }, { status: 403 });
  const caps = capsulaDe(sujeto, new Date());
  const est = await estado(caps.nombre);
  return NextResponse.json({ sujeto, capsula: caps.nombre, estado: est }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const veto = await guardianMando(req);
  if (veto) return veto;
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
  if (accion !== "poner" && accion !== "buscar") return NextResponse.json({ error: "accion inválida" }, { status: 400 });
  const sujetoRaw = typeof cuerpo.sujeto === "string" ? cuerpo.sujeto : typeof cuerpo.sujeto === "object" && cuerpo.sujeto ? (() => {
    const s = cuerpo.sujeto as Record<string, unknown>;
    if (typeof s.tipo === "string" && typeof s.id === "string") return `${s.tipo}:${s.id}`;
    return "";
  })() : "";
  const sujeto = parseSujeto(sujetoRaw) || (typeof cuerpo.tipo === "string" && typeof cuerpo.id === "string" ? parseSujeto(`${cuerpo.tipo}:${cuerpo.id}`) : null);
  if (!sujeto) return NextResponse.json({ error: "sujeto inválido" }, { status: 400 });
  const grupoId = typeof cuerpo.grupoId === "string" ? cuerpo.grupoId : undefined;
  const actor = actorPorTipo(sujeto, grupoId);
  if (accion === "poner") {
    if (!puedeAcceder(actor, sujeto, "escribir")) return NextResponse.json({ error: "sin permiso" }, { status: 403 });
    const texto = typeof cuerpo.texto === "string" ? cuerpo.texto : "";
    if (!texto.trim()) return NextResponse.json({ error: "texto vacío" }, { status: 400 });
    const res = await poner(sujeto, texto, new Date(), {
      titulo: typeof cuerpo.titulo === "string" ? cuerpo.titulo : undefined,
      uri: typeof cuerpo.uri === "string" ? cuerpo.uri : undefined,
      etiquetas: Array.isArray(cuerpo.etiquetas) ? (cuerpo.etiquetas as string[]) : undefined,
      ts: typeof cuerpo.ts === "number" ? cuerpo.ts : undefined,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 502 });
  }
  // buscar
  if (!puedeAcceder(actor, sujeto, "leer")) return NextResponse.json({ error: "sin permiso" }, { status: 403 });
  const consulta = typeof cuerpo.consulta === "string" ? cuerpo.consulta : typeof cuerpo.texto === "string" ? cuerpo.texto : "";
  if (!consulta.trim()) return NextResponse.json({ error: "consulta vacía" }, { status: 400 });
  const k = typeof cuerpo.k === "number" && Number.isInteger(cuerpo.k) ? cuerpo.k : 5;
  const caps = capsulaDe(sujeto, new Date());
  const aciertos = await buscar(caps.nombre, consulta, k);
  return NextResponse.json({ aciertos: aciertos ?? [] }, { status: aciertos === null ? 502 : 200 });
}
EOF

