// Cliente HTTP al servidor de cápsulas Memvid (solo servidor).
// Contrato: architecture/memvid-capsulas.md §4. Sin lanzar si el servidor no responde.
import "server-only";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { capsulaDe, nombreCapsula, necesitaNuevaParte, type SujetoMemoria } from "./capsulas";

export interface AciertoCapsula {
  titulo?: string;
  texto: string;
  uri?: string;
  ts?: number;
}

export interface EstadoCapsula {
  fotogramas?: number;
  tamano?: number;
  tope?: number;
  restante?: number;
}

const TIMEOUT_MS = 1500;
const BASE_URL = "http://127.0.0.1:4490";
const TOKEN_PATH = path.join(homedir(), ".starseed", "memvid.token");

async function leerToken(): Promise<string | null> {
  try {
    const t = await readFile(TOKEN_PATH, "utf-8");
    const limpio = t.trim();
    return limpio.length > 0 ? limpio : null;
  } catch {
    return null;
  }
}

async function fetchConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

async function encabezados(): Promise<Record<string, string> | null> {
  const token = await leerToken();
  if (!token) return null;
  return { "Content-Type": "application/json", "X-StarSeed-Token": token };
}

function sanitizarNombre(nombre: string): boolean {
  return /^[a-z0-9.-]+\.mv2e?$/.test(nombre) && !nombre.includes("/") && !nombre.includes("..");
}

export async function salud(): Promise<boolean> {
  const res = await fetchConTimeout(`${BASE_URL}/salud`, { method: "GET" });
  if (!res || !res.ok) return false;
  return true;
}

export async function estado(nombre: string): Promise<EstadoCapsula | null> {
  if (!sanitizarNombre(nombre)) return null;
  const h = await encabezados();
  if (!h) return null;
  const res = await fetchConTimeout(`${BASE_URL}/capsulas/${encodeURIComponent(nombre)}/estado`, {
    method: "GET",
    headers: h,
  });
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as EstadoCapsula;
  } catch {
    return null;
  }
}

export async function buscar(
  nombre: string,
  consulta: string,
  k = 5,
): Promise<AciertoCapsula[] | null> {
  if (!sanitizarNombre(nombre) || consulta.trim().length === 0) return null;
  const h = await encabezados();
  if (!h) return null;
  const res = await fetchConTimeout(`${BASE_URL}/capsulas/${encodeURIComponent(nombre)}/buscar`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ consulta, k }),
  });
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as { aciertos?: AciertoCapsula[] };
    return Array.isArray(j.aciertos) ? j.aciertos : [];
  } catch {
    return null;
  }
}

export async function linea(
  nombre: string,
  desde?: number,
  hasta?: number,
): Promise<unknown[] | null> {
  if (!sanitizarNombre(nombre)) return null;
  const h = await encabezados();
  if (!h) return null;
  const qs = new URLSearchParams();
  if (typeof desde === "number") qs.set("desde", String(desde));
  if (typeof hasta === "number") qs.set("hasta", String(hasta));
  const url = `${BASE_URL}/capsulas/${encodeURIComponent(nombre)}/linea${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await fetchConTimeout(url, { method: "GET", headers: h });
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as { linea?: unknown[] } | unknown[];
    return Array.isArray((j as { linea?: unknown[] }).linea)
      ? (j as { linea?: unknown[] }).linea ?? []
      : Array.isArray(j)
        ? j
        : [];
  } catch {
    return null;
  }
}

export async function poner(
  sujeto: SujetoMemoria,
  texto: string,
  fecha: Date = new Date(),
  opts: { titulo?: string; uri?: string; etiquetas?: string[]; ts?: number; parte?: number } = {},
): Promise<{ ok: boolean; frame?: unknown; nombre?: string }> {
  if (texto.trim().length === 0) return { ok: false };
  let parte = typeof opts.parte === "number" && Number.isInteger(opts.parte) && opts.parte >= 1 ? opts.parte : 1;
  const cifrada = undefined;

  for (let intento = 0; intento < 2; intento += 1) {
    const caps = capsulaDe(sujeto, fecha, parte, cifrada);
    const nombre = caps.nombre;
    if (!sanitizarNombre(nombre)) return { ok: false };
    const h = await encabezados();
    if (!h) return { ok: false };
    const res = await fetchConTimeout(`${BASE_URL}/capsulas/${encodeURIComponent(nombre)}/poner`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        texto,
        titulo: opts.titulo,
        uri: opts.uri,
        etiquetas: opts.etiquetas,
        ts: opts.ts,
      }),
    });
    if (!res) return { ok: false };
    if (res.status === 507) {
      parte += 1;
      continue;
    }
    if (!res.ok) return { ok: false, nombre };
    try {
      const j = (await res.json()) as { frame?: unknown };
      return { ok: true, frame: j.frame, nombre };
    } catch {
      return { ok: false, nombre };
    }
  }
  return { ok: false };
}
EOF



