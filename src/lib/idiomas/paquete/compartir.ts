import type { PaqueteIdioma } from "./formato";
import { validarPaquete } from "./validar";

export interface Trozo {
  indice: number;
  total: number;
  hashPaquete: string;
  datos: string;
}

export function aArchivo(paquete: PaqueteIdioma): { nombre: string; contenido: string; tipo: "application/json" } {
  const nombre = `${paquete.codigo.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.starseed-lang.json`;
  const contenido = JSON.stringify(paquete, null, 2);
  return { nombre, contenido, tipo: "application/json" };
}

export function aEnlace(base: string, idPublico: string): string {
  const url = new URL(base);
  url.searchParams.set("idioma", idPublico);
  return url.toString();
}

export function desdeEnlace(url: string, base: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const baseParsed = new URL(base);
    if (parsed.origin !== baseParsed.origin) return null;
    const idPublico = parsed.searchParams.get("idioma");
    return idPublico;
  } catch {
    return null;
  }
}

function aBase64(bytes: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}

function deBase64(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function trocear(paquete: PaqueteIdioma, tamano = 16384): Trozo[] {
  const json = JSON.stringify(paquete);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  const total = Math.ceil(bytes.length / tamano);
  const trozos: Trozo[] = [];

  const hashPaquete = paquete.hash;

  for (let i = 0; i < total; i++) {
    const inicio = i * tamano;
    const fin = Math.min(inicio + tamano, bytes.length);
    const chunk = bytes.slice(inicio, fin);
    const base64 = aBase64(chunk);
    trozos.push({ indice: i, total, hashPaquete, datos: base64 });
  }

  return trozos;
}

export async function reunir(
  trozos: Trozo[],
  digest: string
): Promise<{ ok: true; paquete: PaqueteIdioma } | { ok: false; motivo: string }> {
  if (trozos.length === 0) return { ok: false, motivo: "Sin trozos" };

  const total = trozos[0].total;

  const indices = new Set<number>();
  for (const t of trozos) {
    if (t.indice < 0 || t.indice >= total) return { ok: false, motivo: "Índice fuera de rango" };
    if (t.total !== total) return { ok: false, motivo: "Total inconsistente" };
    if (t.hashPaquete !== digest) return { ok: false, motivo: "Hash de paquete no coincide" };
    if (indices.has(t.indice)) return { ok: false, motivo: "Trozo repetido" };
    indices.add(t.indice);
  }

  if (trozos.length !== total) return { ok: false, motivo: "Faltan trozos" };

  for (let i = 0; i < total; i++) {
    if (!indices.has(i)) return { ok: false, motivo: "Faltan trozos" };
  }

  const sorted = [...trozos].sort((a, b) => a.indice - b.indice);
  const chunks = sorted.map((t) => deBase64(t.datos));
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  const decoder = new TextDecoder();
  let paqueteBruto: unknown;
  try {
    paqueteBruto = JSON.parse(decoder.decode(combined));
  } catch {
    return { ok: false, motivo: "JSON inválido" };
  }

  const validado = await validarPaquete(paqueteBruto, { digest });
  if (validado.ok === false) return { ok: false, motivo: validado.errores.join("; ") };

  return { ok: true, paquete: paqueteBruto as PaqueteIdioma };
}