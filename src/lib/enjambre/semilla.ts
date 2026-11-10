/**
 * semilla — el descriptor de un contenido del Enjambre (ENJ1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/enjambre-datos.md` §3. Una semilla lleva: raíz, tamaño, tamaño de hoja y de pieza,
 * nombre, MIME, ámbito, fecha, espejos y firma. NO lleva la capa de piezas (se pide a los pares y se verifica
 * contra la raíz), así que con el imán basta para empezar.
 *
 * Ámbitos: `publico` (en claro, firmada por quien publica) · `privado` / `grupo` / `comunidad` (la raíz es la del
 * TEXTO CIFRADO; nombre y MIME no circulan: van sellados en `meta`, ver `sellado-contenido.ts`).
 * La firma es un gancho inyectado (`FirmarBytes` / `VerificarBytes`): el motor no conoce las claves de la cuenta.
 */

import { ConstructorArbol, TAM_HOJA, elegirTamanoPieza, geometria, MAX_TAMANO_CONTENIDO, MAX_TAMANO_PIEZA, MIN_TAMANO_PIEZA, type ArbolMerkle, type Geometria } from "./arbol";
import { jsonCanonico, leerFirma, type FirmaEnj, type FirmarBytes, type VerificarBytes } from "./firmas";
import { validarUrlEspejo } from "./url-segura";
import { aBytes, aHex, entero, esObjeto, hex64, potenciaDeDos } from "./util";

export type Ambito = "privado" | "grupo" | "comunidad" | "publico";
export const AMBITOS: readonly Ambito[] = ["privado", "grupo", "comunidad", "publico"];

export function esAmbito(x: unknown): x is Ambito {
  return typeof x === "string" && (AMBITOS as readonly string[]).includes(x);
}

export const MAX_ESPEJOS = 4;
const ORDEN_CAMPOS = ["v", "raiz", "tamano", "tamanoHoja", "tamanoPieza", "nombre", "mime", "ambito", "creada", "meta", "espejos"] as const;

export interface Semilla {
  v: 1;
  /** SHA-256 Merkle (hex, 64). En ámbitos no públicos, del texto cifrado. */
  raiz: string;
  /** Bytes del flujo que se reparte (el texto cifrado en ámbitos no públicos). */
  tamano: number;
  tamanoHoja: number;
  /** Tamaño de pieza nominal; el efectivo lo da `geometriaDeSemilla`. */
  tamanoPieza: number;
  /** Vacío si el ámbito no es público (va en `meta`). */
  nombre: string;
  mime: string;
  ambito: Ambito;
  /** Epoch ms de creación. */
  creada: number;
  /** Metadatos sellados (base64) de los ámbitos no públicos. */
  meta?: string;
  espejos?: string[];
  firma?: FirmaEnj;
}

/** Texto seguro para mostrar: sin controles ni marcas de dirección que disfracen nombres. */
export function textoSeguro(x: unknown, max: number): string | null {
  if (typeof x !== "string" || x.length > max) return null;
  if (/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏﻿]/.test(x)) return null;
  return x;
}

const RE_MIME = /^[a-z0-9][a-z0-9!#$&^_.+\-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+\-]{0,62}$/;

/** Saneado estricto de una semilla recibida. Nunca lanza. */
export function leerSemilla(x: unknown): Semilla | null {
  if (!esObjeto(x) || x.v !== 1) return null;
  const raiz = hex64(x.raiz);
  const tamano = entero(x.tamano, 0, MAX_TAMANO_CONTENIDO);
  const tamanoHoja = entero(x.tamanoHoja, TAM_HOJA, TAM_HOJA);
  const tamanoPieza = entero(x.tamanoPieza, MIN_TAMANO_PIEZA, MAX_TAMANO_PIEZA);
  const nombre = textoSeguro(x.nombre, 255);
  const mime = textoSeguro(x.mime, 127);
  const creada = entero(x.creada, 0, 8.64e15);
  if (!raiz || tamano === null || tamanoHoja === null || tamanoPieza === null || nombre === null || mime === null || creada === null) return null;
  if (!potenciaDeDos(tamanoPieza)) return null;
  if (!esAmbito(x.ambito)) return null;
  if (mime !== "" && !RE_MIME.test(mime)) return null;
  const s: Semilla = { v: 1, raiz, tamano, tamanoHoja, tamanoPieza, nombre, mime, ambito: x.ambito, creada };
  if (x.ambito !== "publico" && (nombre !== "" || mime !== "")) return null;
  if (x.meta !== undefined) {
    if (typeof x.meta !== "string" || x.meta.length > 4096 || !/^[A-Za-z0-9+/]*={0,2}$/.test(x.meta)) return null;
    s.meta = x.meta;
  }
  if (x.espejos !== undefined) {
    if (!Array.isArray(x.espejos) || x.espejos.length > MAX_ESPEJOS) return null;
    const es: string[] = [];
    for (const e of x.espejos) {
      const u = validarUrlEspejo(e);
      if (!u) return null;
      es.push(u);
    }
    s.espejos = es;
  }
  if (x.firma !== undefined) {
    const f = leerFirma(x.firma);
    if (!f) return null;
    s.firma = f;
  }
  return s;
}

export function geometriaDeSemilla(s: Semilla): Geometria | null {
  return geometria(s.tamano, s.tamanoPieza);
}

/** Bytes que se firman: JSON con orden fijo, sin la firma. */
export function cuerpoFirmable(s: Semilla): Uint8Array {
  return aBytes("ss-semilla-v1|" + jsonCanonico(s as unknown as Record<string, unknown>, ORDEN_CAMPOS));
}

export async function firmarSemilla(s: Semilla, firmar: FirmarBytes): Promise<Semilla | null> {
  const sin: Semilla = { ...s };
  delete sin.firma;
  const f = await firmar(cuerpoFirmable(sin)).catch(() => null);
  return f ? { ...sin, firma: f } : null;
}

/**
 * ¿La semilla es auténtica? Las públicas DEBEN venir firmadas (quien las siembre sabe quién las publicó);
 * las demás pueden ir sin firma (la firma útil va dentro del paquete sellado para los miembros).
 */
export async function verificarSemilla(s: Semilla, verificar: VerificarBytes, o: { exigirFirma?: boolean } = {}): Promise<boolean> {
  if (!s.firma) return !(o.exigirFirma ?? s.ambito === "publico");
  const sin: Semilla = { ...s };
  delete sin.firma;
  return verificar(cuerpoFirmable(sin), s.firma).catch(() => false);
}

export interface OpcionesSemilla {
  nombre?: string;
  mime?: string;
  ambito: Ambito;
  tamanoPieza?: number;
  espejos?: string[];
  creada?: number;
  meta?: string;
}

/** Semilla a partir del árbol ya construido (de los bytes que se reparten). */
export function semillaDeArbol(arbol: ArbolMerkle, o: OpcionesSemilla): Semilla | null {
  const tamanoPieza = o.tamanoPieza ?? elegirTamanoPieza(arbol.tamano);
  if (!geometria(arbol.tamano, tamanoPieza)) return null;
  const publico = o.ambito === "publico";
  const nombre = publico ? (o.nombre ?? "") : "";
  const mime = publico ? (o.mime ?? "") : "";
  const s: Semilla = { v: 1, raiz: aHex(arbol.raiz), tamano: arbol.tamano, tamanoHoja: TAM_HOJA, tamanoPieza, nombre, mime, ambito: o.ambito, creada: o.creada ?? Date.now() };
  if (o.meta) s.meta = o.meta;
  if (o.espejos?.length) s.espejos = o.espejos.slice(0, MAX_ESPEJOS);
  return leerSemilla(s);
}

/** Construye árbol y semilla (sin firmar) de unos bytes. Para contenido grande, usar `ConstructorArbol` por tandas. */
export async function crearSemillaDeBytes(datos: Uint8Array, o: OpcionesSemilla): Promise<{ semilla: Semilla; arbol: ArbolMerkle } | null> {
  const c = new ConstructorArbol();
  await c.agregar(datos);
  const arbol = await c.cerrar();
  const semilla = semillaDeArbol(arbol, o);
  return semilla ? { semilla, arbol } : null;
}

/** Semilla mínima con lo que da un imán (sin firma, sin MIME): lo justo para pedir la capa y los trozos. */
export function semillaMinima(raiz: string, tamano: number, ambito: Ambito, nombre = "", tamanoPieza?: number): Semilla | null {
  const publico = ambito === "publico";
  return leerSemilla({ v: 1, raiz, tamano, tamanoHoja: TAM_HOJA, tamanoPieza: tamanoPieza ?? elegirTamanoPieza(tamano), nombre: publico ? nombre : "", mime: "", ambito, creada: 0 });
}
