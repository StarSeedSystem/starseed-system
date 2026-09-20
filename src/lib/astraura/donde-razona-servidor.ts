/**
 * donde-razona-servidor.ts — Decisión del destino de Astraura en servidor (Ola CC5 · 2026-09-20).
 */

import os from "node:os";
import { medirPerfil, type PerfilHardware, type EntornoMedicion } from "./perfil-hardware";

export type DestinoServidor = "local" | "nube";

export interface ResultadoDestinoServidor {
  destino: DestinoServidor;
  motivo: string;
}

export interface OpcionesDestinoServidor {
  destinoPedido?: string | null;
  forzarRecalculo?: boolean;
}

export function perfilDeEstaMaquina(): PerfilHardware {
  const cpus = Math.max(1, os.cpus()?.length ?? 1);
  const ramGb = (os.totalmem() ?? 0) / (1024 * 1024 * 1024);
  const arq = os.arch();
  const entorno: EntornoMedicion = {
    hardwareConcurrency: cpus,
    deviceMemory: ramGb,
    userAgent: `Node.js (${os.platform()} ${arq})`,
    esTauri: true,
    esPWA: false,
  };
  return medirPerfil(entorno);
}

export function elegirDestino(
  perfil?: PerfilHardware | null,
  destinoPedido?: string | null,
  bitnetVivo?: boolean
): ResultadoDestinoServidor {
  if (destinoPedido) {
    const p = destinoPedido.trim().toLowerCase();
    if (p === "local") return { destino: "local", motivo: "Destino solicitado explícitamente: local" };
    if (p === "nube") return { destino: "nube", motivo: "Destino solicitado explícitamente: nube" };
  }

  if (!perfil) {
    return { destino: "nube", motivo: "Sin datos de perfil de hardware, usando nube por seguridad" };
  }

  const bitnetActivo = bitnetVivo === true;
  if (perfil.nivel === "pleno" && bitnetActivo) {
    return { destino: "local", motivo: "Perfil pleno y motor BitNet activo en el servidor" };
  }
  if (perfil.nivel === "pleno" && !bitnetActivo) {
    return { destino: "nube", motivo: "Perfil pleno pero motor BitNet apagado en el servidor" };
  }
  if (perfil.nivel === "justo") {
    return { destino: "nube", motivo: "Perfil justo (ej. 8 GB RAM), razonamiento asignado a la nube" };
  }
  return { destino: "nube", motivo: `Perfil ${perfil.nivel}, razonamiento asignado a la nube` };
}

let cacheDestino: { ts: number; resultado: ResultadoDestinoServidor } | null = null;
const CACHE_MS = 60_000;

async function comprobarBitnetVivoServidor(): Promise<boolean> {
  const baseLocal = String(process.env.ASTRAURA_LOCAL_URL ?? "").trim().replace(/\/+$/, "") || "http://127.0.0.1:8000";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${baseLocal}/api/bitnet/estado`, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { ok?: boolean; activo?: boolean } | null;
    return !!(data && (data.ok === true || data.activo === true));
  } catch {
    return false;
  }
}

export async function destinoParaPeticion(opciones?: OpcionesDestinoServidor): Promise<ResultadoDestinoServidor> {
  const pedido = opciones?.destinoPedido;
  if (pedido) {
    const p = pedido.trim().toLowerCase();
    if (p === "local" || p === "nube") return elegirDestino(null, p, false);
  }
  const ahora = Date.now();
  if (!opciones?.forzarRecalculo && cacheDestino && ahora - cacheDestino.ts < CACHE_MS) {
    return cacheDestino.resultado;
  }
  const perfil = perfilDeEstaMaquina();
  const bitnetVivo = await comprobarBitnetVivoServidor();
  const resultado = elegirDestino(perfil, null, bitnetVivo);
  cacheDestino = { ts: ahora, resultado };
  return resultado;
}
