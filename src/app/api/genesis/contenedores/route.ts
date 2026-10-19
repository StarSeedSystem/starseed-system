import { randomBytes } from "node:crypto";
import { crearTokenMotor } from "@/lib/mando/motor-token";
import { validarCuerpoMotor } from "@/lib/mando/motores";
import { guardianMando } from "@/lib/mando/guardian";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" } as const;
const EXPIRACION_MS = 15 * 60 * 1000;

type CodeEntry = { ambitoId: string; expiraEn: number; usado: boolean };

const codigos = new Map<string, CodeEntry>();

function sinBandera(): boolean {
  return process.env.STARSEED_MANDO_TODOS !== "1";
}

function generarCodigo(): string {
  return randomBytes(4).toString("hex");
}

function ambitoDe(peticion: Request): string | null {
  const url = new URL(peticion.url);
  return url.searchParams.get("ambito") ?? null;
}

export async function GET(peticion: Request): Promise<Response> {
  if (sinBandera()) return new Response("Not Found", { status: 404 });
  const ambitoId = ambitoDe(peticion);
  if (!ambitoId) return Response.json({ error: "Falta ?ambito=" }, { status: 400 });
  const veto = await guardianMando(peticion, { ambito: ambitoId, capacidad: "ver-detalle" });
  if (veto) return veto;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("genesis_motores_registro")
    .select("id, motor_id, tipo, huella_token, emparejado_en")
    .eq("ambito_id", ambitoId);
  if (error) return Response.json({ error: "No se pudieron leer los motores." }, { status: 500 });
  return Response.json({ motores: data ?? [] }, { headers: SIN_CACHE });
}

export async function POST(peticion: Request): Promise<Response> {
  if (sinBandera()) return new Response("Not Found", { status: 404 });
  const ambitoId = ambitoDe(peticion);
  if (!ambitoId) return Response.json({ error: "Falta ?ambito=" }, { status: 400 });
  const veto = await guardianMando(peticion, { ambito: ambitoId, capacidad: "gestionar-motores" });
  if (veto) return veto;

  let cuerpo: unknown;
  try { cuerpo = await peticion.json(); } catch { return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 }); }

  if (cuerpo && typeof cuerpo === "object" && "codigo" in cuerpo) {
    const codigo = String((cuerpo as any).codigo || "");
    const entry = codigos.get(codigo);
    const ahora = Date.now();
    if (!entry || entry.ambitoId !== ambitoId || entry.usado || ahora > entry.expiraEn) {
      return Response.json({ error: "Código inválido o expirado." }, { status: 400 });
    }
    const valido = validarCuerpoMotor(cuerpo);
    if (!valido.ok) return Response.json({ error: valido.error }, { status: 400 });
    const { token, hash, huella } = crearTokenMotor();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("genesis_motores_registro")
      .insert({ ambito_id: ambitoId, motor_id: valido.valor.nombre, tipo: valido.valor.tipo, huella_token: huella })
      .select("id")
      .single();
    if (error) return Response.json({ error: "No se pudo registrar el motor." }, { status: 403 });
    entry.usado = true;
    return Response.json({ motor_id: data.id, huella, token }, { status: 201, headers: SIN_CACHE });
  }

  const codigo = generarCodigo();
  const expiraEn = Date.now() + EXPIRACION_MS;
  codigos.set(codigo, { ambitoId, expiraEn, usado: false });
  return Response.json({ codigo, expiraEn: new Date(expiraEn).toISOString() }, { status: 201, headers: SIN_CACHE });
}

export async function DELETE(peticion: Request): Promise<Response> {
  if (sinBandera()) return new Response("Not Found", { status: 404 });
  const ambitoId = ambitoDe(peticion);
  if (!ambitoId) return Response.json({ error: "Falta ?ambito=" }, { status: 400 });
  const veto = await guardianMando(peticion, { ambito: ambitoId, capacidad: "gestionar-motores" });
  if (veto) return veto;
  const url = new URL(peticion.url);
  const motorId = url.searchParams.get("motor") ?? "";
  if (!motorId) return Response.json({ error: "Falta ?motor=" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("genesis_motores_registro").delete().eq("id", motorId).eq("ambito_id", ambitoId);
  if (error) return Response.json({ error: "No se pudo revocar el motor." }, { status: 403 });
  return Response.json({ ok: true }, { headers: SIN_CACHE });
}
