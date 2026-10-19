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

async function handler(peticion: Request, metodo: "GET" | "POST" | "DELETE"): Promise<Response> {
  if (sinBandera()) return new Response("Not Found", { status: 404 });
  const ambitoId = ambitoDe(peticion);
  if (!ambitoId) return Response.json({ error: "Falta ?ambito=" }, { status: 400 });
  const veto = await guardianMando(peticion, { ambito: ambitoId, capacidad: "gestionar-motores" });
  if (veto) return veto;
  return null as any;
}
