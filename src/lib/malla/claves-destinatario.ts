/**
 * claves-destinatario — de dónde sale la clave pública de cifrado de la neurona que recibe un archivo (MPT1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Para sellar un archivo (`canal-sellado.ts`) hace falta la pública ECDH P-256 de cada neurona destinataria. Se busca,
 * por este orden y parando en la primera que responde:
 *   1. vivo         · el saludo del enlace abierto ahora (Wi‑Fi directo, canal local…): la más fresca y ya probada;
 *   2. instantánea  · la copia local de la cuenta (OFF1108A): claves vistas antes de neuronas de ESTA cuenta, para
 *                     funcionar sin internet tras cerrar y abrir la app. Solo neuronas de la cuenta recordada;
 *   3. certificado  · la de un saludo cuyo certificado cuenta→neurona (IDN1108A) se verificó;
 *   4. servidor     · el registro: claves publicadas y verificadas del relé (`encryptionKeyFor`) o la fila de la
 *                     neurona en `neuron_devices.capabilities.epub`, solo con internet.
 * Varias neuronas (un grupo, o todas las de una cuenta) = una copia sellada por destinatario (sin repetir clave).
 * Toda clave pasa por `esClaveCifrado` (EC P‑256 pública, sin parte privada). Nada de esto toca la red por sí mismo:
 * las fuentes reales se montan aparte y el resolutor se prueba con fuentes inyectadas. Nunca lanza.
 */

import type { DestinatarioArchivo } from "@/lib/malla/cifrado-archivo";

export type OrigenClave = "vivo" | "instantanea" | "certificado" | "servidor";
export const ORDEN_ORIGENES: readonly OrigenClave[] = ["vivo", "instantanea", "certificado", "servidor"];

export interface FuenteClave {
  origen: OrigenClave;
  buscar(neurona: string): Promise<JsonWebKey | null | undefined> | JsonWebKey | null | undefined;
}

export interface ResultadoClaves {
  destinatarios: DestinatarioArchivo[];
  /** Cuál fuente dio la clave de cada neurona. */
  origenes: Record<string, OrigenClave>;
  /** Neuronas para las que ninguna fuente tenía clave (no se les manda sobre). */
  sinClave: string[];
}

/** ¿Es una pública ECDH P-256 usable? (sin `d`, curva y coordenadas presentes). */
export function esClaveCifrado(x: unknown): x is JsonWebKey {
  if (!x || typeof x !== "object") return false;
  const k = x as Record<string, unknown>;
  return k.kty === "EC" && k.crv === "P-256" && typeof k.x === "string" && typeof k.y === "string" && k.x.length > 0 && k.y.length > 0 && k.d === undefined;
}

function soloPublica(k: JsonWebKey): JsonWebKey {
  return { kty: "EC", crv: "P-256", x: k.x, y: k.y };
}

function huella(k: JsonWebKey): string {
  return `${k.x}.${k.y}`;
}

/** (ARC1110A) Plazo máximo de cada fuente de claves: pasado, se prueba la siguiente (no hay esperas muertas sin red). */
export const PLAZO_FUENTE_MS = 2_500;

async function conPlazoFuente<T>(p: Promise<T>): Promise<T | null> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<null>((res) => (reloj = setTimeout(() => res(null), PLAZO_FUENTE_MS)))]);
  } finally {
    if (reloj !== undefined) clearTimeout(reloj);
  }
}

/** Resuelve las claves de `neuronas` con `fuentes` (se ordenan por `ORDEN_ORIGENES`). Nunca lanza. */

export async function resolverClaves(neuronas: readonly string[], fuentes: readonly FuenteClave[]): Promise<ResultadoClaves> {
  const orden = [...fuentes].sort((a, b) => ORDEN_ORIGENES.indexOf(a.origen) - ORDEN_ORIGENES.indexOf(b.origen));
  const destinatarios: DestinatarioArchivo[] = [];
  const origenes: Record<string, OrigenClave> = {};
  const sinClave: string[] = [];
  const vistas = new Set<string>();
  for (const n of Array.from(new Set(neuronas.filter((x) => typeof x === "string" && x)))) {
    let hallada = false;
    for (const f of orden) {
      let k: JsonWebKey | null | undefined;
      try {
        // ARC1110A: ninguna fuente (sobre todo el servidor sin internet de verdad) bloquea la oferta más de PLAZO_FUENTE_MS.
        k = await conPlazoFuente(Promise.resolve(f.buscar(n)));
      } catch {
        k = null;
      }
      if (!esClaveCifrado(k)) continue;
      hallada = true;
      origenes[n] = f.origen;
      const h = huella(k);
      if (!vistas.has(h)) {
        vistas.add(h);
        destinatarios.push({ pub: soloPublica(k), rfp: n.slice(0, 64) });
      }
      break;
    }
    if (!hallada) sinClave.push(n);
  }
  return { destinatarios, origenes, sinClave };
}

/* ── Registros en memoria (los alimentan los saludos y el servidor) ── */

const vivas = new Map<string, JsonWebKey>();
const certificadas = new Map<string, JsonWebKey>();
const MAX_REGISTRO = 256;

function guardar(m: Map<string, JsonWebKey>, neurona: string, k: JsonWebKey): void {
  m.delete(neurona);
  m.set(neurona, soloPublica(k));
  while (m.size > MAX_REGISTRO) m.delete(m.keys().next().value as string);
}

/** El saludo de un enlace abierto ahora trajo esta clave de cifrado. */
export function recordarClaveViva(neurona: string, k: unknown): boolean {
  if (!neurona || !esClaveCifrado(k)) return false;
  guardar(vivas, neurona, k);
  return true;
}

/** Un saludo con certificado cuenta→neurona VERIFICADO trajo esta clave. Llamar solo tras verificarlo. */
export function recordarClaveCertificada(neurona: string, k: unknown): boolean {
  if (!neurona || !esClaveCifrado(k)) return false;
  guardar(certificadas, neurona, k);
  return true;
}

export function olvidarClavesVivas(neurona?: string): void {
  if (neurona) {
    vivas.delete(neurona);
    return;
  }
  vivas.clear();
}

export const fuenteVivo: FuenteClave = { origen: "vivo", buscar: (n) => vivas.get(n) ?? null };
export const fuenteCertificado: FuenteClave = { origen: "certificado", buscar: (n) => certificadas.get(n) ?? null };

/** Instantánea local (OFF1108A): `leer`/`guardar` por neurona; `esDeLaCuenta` limita a las neuronas de la cuenta. */
export interface AlmacenClavesCuenta {
  leer(neurona: string): Promise<JsonWebKey | null | undefined>;
  escribir(neurona: string, k: JsonWebKey): Promise<void>;
}

export function fuenteInstantanea(almacen: AlmacenClavesCuenta, esDeLaCuenta: (neurona: string) => boolean): FuenteClave {
  return {
    origen: "instantanea",
    buscar: async (n) => (esDeLaCuenta(n) ? ((await almacen.leer(n)) ?? null) : null),
  };
}

/** Anota en la instantánea las claves de neuronas de la cuenta que se acaban de resolver (para la próxima vez sin red). */
export async function recordarEnInstantanea(
  almacen: AlmacenClavesCuenta,
  esDeLaCuenta: (neurona: string) => boolean,
  r: ResultadoClaves,
  neuronas: readonly string[],
  claveDe: (neurona: string) => JsonWebKey | null,
): Promise<number> {
  let n = 0;
  for (const id of neuronas) {
    if (!esDeLaCuenta(id) || r.origenes[id] === undefined || r.origenes[id] === "instantanea") continue;
    const k = claveDe(id);
    if (!k || !esClaveCifrado(k)) continue;
    try {
      await almacen.escribir(id, soloPublica(k));
      n++;
    } catch {
      /* la copia local es un extra */
    }
  }
  return n;
}

/** Fuente de servidor: solo con internet. `buscarEnRegistro` mira el relé y la fila de neuronas. */
export function fuenteServidor(hayInternet: () => boolean, buscarEnRegistro: (neurona: string) => Promise<JsonWebKey | null | undefined> | JsonWebKey | null | undefined): FuenteClave {
  return {
    origen: "servidor",
    buscar: (n) => (hayInternet() ? buscarEnRegistro(n) : null),
  };
}
