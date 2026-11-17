/**
 * IMA13 · Compartir un paquete de idioma: archivo, enlace y trozos para la malla.
 * Módulo PURO: sin red, sin disco y sin `node:*`. La malla transporta los trozos.
 */
import { validarPaquete, type PaqueteIdioma } from "./validar";
import { extension } from "./formato";

export interface ArchivoPaquete {
  nombre: string; contenido: string; tipo: "application/json";
}

export interface Trozo {
  indice: number; total: number; hashPaquete: string; datos: string;
}

export type ResultadoReunion =
  { ok: true; paquete: PaqueteIdioma } | { ok: false; motivo: string };

function aBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function deBase64(texto: string): Uint8Array | null {
  try {
    const binario = atob(texto);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function hashDeBytes(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ byte, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function aArchivo(paquete: PaqueteIdioma): ArchivoPaquete {
  const seguro = paquete.codigo.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return { nombre: `${seguro}${extension}`, contenido: JSON.stringify(paquete), tipo: "application/json" };
}

export function aEnlace(base: string, idPublico: string): string {
  const separador = base.includes("?") ? "&" : "?";
  return `${base}${separador}idioma=${encodeURIComponent(idPublico)}`;
}

export function desdeEnlace(url: string, base?: string): string | null {
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return null;
  }
  if (destino.protocol !== "https:") return null;
  if (base) {
    let raiz: URL;
    try {
      raiz = new URL(base);
    } catch {
      return null;
    }
    const sinBarra = (ruta: string) => ruta.replace(/\/+$/, "");
    if (destino.origin !== raiz.origin || sinBarra(destino.pathname) !== sinBarra(raiz.pathname)) return null;
  }
  const id = destino.searchParams.get("idioma");
  return id ? id : null;
}

export function trocear(paquete: PaqueteIdioma, tamano = 16_384): Trozo[] {
  const bytes = new TextEncoder().encode(aArchivo(paquete).contenido);
  const paso = Number.isInteger(tamano) && tamano > 0 ? tamano : 16_384;
  const total = Math.max(1, Math.ceil(bytes.length / paso));
  const hashPaquete = hashDeBytes(bytes);
  return Array.from({ length: total }, (_, indice) => ({
    indice, total, hashPaquete,
    datos: aBase64(bytes.subarray(indice * paso, (indice + 1) * paso)),
  }));
}
export async function reunir(trozos: Trozo[], digest: string): Promise<ResultadoReunion> {
  if (trozos.length === 0) return { ok: false, motivo: "no hay trozos" };
  const total = trozos[0].total, hashPaquete = trozos[0].hashPaquete;
  if (!Number.isInteger(total) || total <= 0) return { ok: false, motivo: "el total de trozos no es válido" };
  if (!hashPaquete) return { ok: false, motivo: "falta el hash del paquete" };
  const partes = new Array<string | undefined>(total);
  for (const trozo of trozos) {
    if (trozo.total !== total) return { ok: false, motivo: "no son del mismo paquete" };
    if (trozo.hashPaquete !== hashPaquete) return { ok: false, motivo: "hashes distintos" };
    if (!Number.isInteger(trozo.indice) || trozo.indice < 0 || trozo.indice >= total) return { ok: false, motivo: "trozo fuera de rango" };
    if (partes[trozo.indice] !== undefined) return { ok: false, motivo: "hay un trozo repetido" };
    partes[trozo.indice] = trozo.datos;
  }
  const bytes: number[] = [];
  for (let indice = 0; indice < total; indice++) {
    const datos = partes[indice];
    if (datos === undefined) return { ok: false, motivo: "faltan trozos" };
    const parte = deBase64(datos);
    if (!parte) return { ok: false, motivo: "un trozo no es base64 válido" };
    for (const byte of parte) bytes.push(byte);
  }
  const completo = Uint8Array.from(bytes);
  if (hashDeBytes(completo) !== hashPaquete) return { ok: false, motivo: "el hash del paquete no coincide" };
  let bruto: unknown;
  try {
    bruto = JSON.parse(new TextDecoder().decode(completo));
  } catch {
    return { ok: false, motivo: "el paquete no es JSON válido" };
  }
  const validado = await validarPaquete(bruto, { digest });
  if (!validado.ok) return { ok: false, motivo: validado.errores.join("; ") };
  return { ok: true, paquete: validado.paquete };
}
