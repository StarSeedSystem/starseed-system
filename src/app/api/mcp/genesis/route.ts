/**
 * Ruta MCP remota de Genesis por ámbito (Ola 1019G · GCA1019S).
 * POST con token externo del ámbito o sesión; GET responde 405.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
import { createClient as crearClienteSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { guardianMando } from "@/lib/mando/guardian";
import { rateLimit } from "@/lib/security/rate-limit";
import { HERRAMIENTAS_MCP } from "@/lib/genesis/mcp/herramientas";
import { huellaSha256 } from "@/lib/genesis/mcp/tokens-externos";
import {
  crearRutaMcp,
  leerBearer,
  type IdentidadRuta,
  type RegistroLlamada,
  type ResultadoIdentidad,
} from "@/lib/genesis/mcp/ruta-ambito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_RAFAGA = 120;
const VENTANA_MS = 60_000;

interface FilaToken {
  ambito_id?: unknown;
  alcance?: unknown;
  usos?: unknown;
  caduca?: unknown;
  revocado_en?: unknown;
}

let clienteServicio: SupabaseClient | null | undefined;

function servicio(): SupabaseClient | null {
  if (clienteServicio !== undefined) return clienteServicio;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  clienteServicio = url && clave ? crearClienteSupabase(url, clave, { auth: { persistSession: false } }) : null;
  return clienteServicio;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function alcanceDe(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

function vencido(valor: unknown, ahora: number): boolean {
  const fecha = texto(valor);
  return !!fecha && Date.parse(fecha) <= ahora;
}

function rechazo(status: number, mensaje: string): ResultadoIdentidad {
  return {
    ok: false,
    respuesta: Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: mensaje } },
      { status, headers: { "Cache-Control": "no-store" } },
    ),
  };
}

async function identificarToken(valor: string): Promise<ResultadoIdentidad> {
  throw new Error("pendiente");
}

async function identificarSesion(req: Request): Promise<ResultadoIdentidad> {
  throw new Error("pendiente");
}

async function identificar(req: Request): Promise<ResultadoIdentidad> {
  const bearer = leerBearer(req.headers.get("authorization"));
  return bearer ? identificarToken(bearer) : identificarSesion(req);
}

async function registrar(registro: RegistroLlamada): Promise<void> {
  throw new Error("pendiente");
}

async function contarUso(huella: string): Promise<void> {
  throw new Error("pendiente");
}

const ruta = crearRutaMcp({
  herramientas: HERRAMIENTAS_MCP,
  ahora: Date.now,
  identificar,
  registrar,
  contarUso,
  permitirRafaga: (huella) => rateLimit(`mcp-genesis:${huella}`, LIMITE_RAFAGA, VENTANA_MS).allowed,
});

export async function GET(req: Request): Promise<Response> {
  return ruta.GET(req);
}

export async function POST(req: Request): Promise<Response> {
  return ruta.POST(req);
}
