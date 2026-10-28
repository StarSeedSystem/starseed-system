import { NextRequest } from "next/server";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";
import { guardianMando } from "@/lib/mando/guardian";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/utils/supabase/server";
import { fusionarCatalogos } from "@/lib/genesis/conectores/catalogo-opciones";
import { CONTENEDORES_OPCIONES } from "@/lib/genesis/conectores/contenedores";
import { guardarClave } from "@/lib/genesis/conectores/boveda-servidor";
import { huellaDe, leerAmbito, leerPeticionOpciones } from "@/lib/genesis/conectores/api-conectores";
import { vistaOpciones, type FilaAsignacion } from "@/lib/genesis/conectores/opciones-ambito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CUERPO = 64 * 1024;
const SIN_CACHE = { "Cache-Control": "no-store" } as const;
const CATALOGO = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);

function json(datos: unknown, status = 200): Response {
  return Response.json(datos, { status, headers: SIN_CACHE });
}

function ambitoDe(req: NextRequest): string | null {
  return leerAmbito(new URL(req.url).searchParams.get("ambito"));
}

async function permiso(req: NextRequest, ambito: string, capacidad: "ver-detalle" | "gestionar-accesos"): Promise<Response | null> {
  const veto = await guardianMando(req, { ambito, capacidad });
  if (veto) return veto;
  const limite = rateLimit(`genesis-conectores:${ambito}`, 20, 10 * 60 * 1000);
  if (limite.allowed) return null;
  return json(
    { error: `Has pedido muchas opciones seguidas. Vuelve a intentarlo en ${limite.retryAfterSec} s.` },
    429,
  );
}

async function leerFilas(ambito: string): Promise<{ filas: FilaAsignacion[]; vinculadas: Set<string> }> {
  const supabase = await createClient();
  const [asignaciones, boveda] = await Promise.all([
    supabase.from("genesis_asignaciones").select("clave, cadena").eq("ambito_id", ambito),
    supabase.from("genesis_boveda").select("proveedor").eq("ambito_id", ambito).is("revocada_en", null),
  ]);
  const filas = (asignaciones.data ?? []) as FilaAsignacion[];
  const vinculadas = new Set<string>(
    ((boveda.data ?? []) as { proveedor?: unknown }[])
      .map((fila) => fila.proveedor)
      .filter((id): id is string => typeof id === "string"),
  );
  return { filas, vinculadas };
}

export async function GET(req: NextRequest): Promise<Response> {
  const ambito = ambitoDe(req);
  if (!ambito) return json({ error: "Falta ?ambito=." }, 400);
  const veto = await permiso(req, ambito, "ver-detalle");
  if (veto) return veto;
  try {
    const { filas, vinculadas } = await leerFilas(ambito);
    return json(
      vistaOpciones({ ambito, catalogo: CATALOGO, filas, vinculadas, contenedores: CONTENEDORES_OPCIONES }),
    );
  } catch {
    return json({ error: "No se pudo leer el catálogo del ámbito." }, 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const ambito = ambitoDe(req);
  if (!ambito) return json({ error: "Falta ?ambito=." }, 400);
  const veto = await permiso(req, ambito, "gestionar-accesos");
  if (veto) return veto;
  const crudo = await req.text().catch(() => "");
  if (!crudo || crudo.length > MAX_CUERPO) return json({ error: "Petición vacía o demasiado grande." }, 400);
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return json({ error: "JSON inválido en el cuerpo." }, 400);
  }
  const lectura = leerPeticionOpciones(cuerpo);
  if (!lectura.ok) return json({ error: lectura.error }, 400);
  const peticion = lectura.peticion;
  try {
    if (peticion.accion === "vincular") {
      const guardado = await guardarClave(ambito, peticion.proveedor, peticion.valor);
      if (!guardado.ok) return json({ error: "No se pudo guardar la clave en la bóveda." }, 400);
      const huella = await huellaDe(peticion.valor);
      return json({ accion: "vincular", proveedor: peticion.proveedor, huella, ambito }, 201);
    }
    const supabase = await createClient();
    const { error } = await supabase.from("genesis_asignaciones").insert({
      ambito_id: ambito,
      clave: peticion.clave,
      cadena: { cadena: [peticion.cadena], respaldo: [] },
    });
    if (error) return json({ error: "No se pudo guardar la asignación." }, 400);
    return json({ accion: "asignar", clave: peticion.clave, cadena: peticion.cadena, ambito, ok: true });
  } catch {
    return json({ error: "No se pudo completar la operación." }, 500);
  }
}
