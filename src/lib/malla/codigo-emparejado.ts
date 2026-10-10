/**
 * codigo-emparejado — el «código» que dos aparatos se pasan para enlazarse SIN internet (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Un aparato crea una oferta WebRTC sin servidores (solo candidatos de su red local) y la convierte
 * en un código de texto; el otro lo lee (QR con la cámara o pegando el texto) y devuelve el suyo.
 *
 *   formato:  SSL1z.<base64url( deflate-raw( JSON ) )>   (comprimido con CompressionStream)
 *             SSL1u.<base64url( JSON )>                  (si el navegador no comprime)
 *   JSON:     { v: 1, r: "o" | "a", s: <sesión>, sdp: <SDP completo>, n?: <nombre del aparato> }
 *
 * Sin dependencias y PURO salvo `CompressionStream` (estándar en navegadores y Node ≥ 18). El
 * código no lleva claves ni tokens: solo la descripción de red que cualquier aparato del mismo
 * Wi-Fi vería al conectarse. Contrato: `architecture/transporte-universal-sin-internet.md`.
 */

export const PREFIJO_CODIGO = "SSL1";
/** Tope de tamaño de un SDP aceptado (un SDP de solo datos ronda 500-1500 caracteres). */
export const MAX_SDP = 20_000;
/** Extrae un código aunque venga dentro de un texto más largo (mensaje compartido, enlace). */
const RE_CODIGO = /SSL1[zu]\.[A-Za-z0-9_-]+/;

export type RolCodigo = "o" | "a";

export interface DatosCodigo {
  /** «o» = oferta (quien empieza) · «a» = respuesta (quien la lee). */
  r: RolCodigo;
  /** Sesión de emparejado: la respuesta debe traer la misma que la oferta. */
  s: string;
  sdp: string;
  /** Nombre legible del aparato que crea el código. */
  n?: string;
}

export type ResultadoDecodificar = { ok: true; datos: DatosCodigo } | { ok: false; motivo: string };

/* ── base64url sin dependencias ───────────────────────────────────────────────────────────── */

export function aBase64Url(bytes: Uint8Array): string {
  let bin = "";
  const PASO = 0x8000;
  for (let i = 0; i < bytes.length; i += PASO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + PASO));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64Url(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + relleno);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ── compresión deflate-raw ───────────────────────────────────────────────────────────────── */

export function puedeComprimir(): boolean {
  try {
    return typeof CompressionStream === "function" && typeof DecompressionStream === "function" && !!new CompressionStream("deflate-raw");
  } catch {
    return false;
  }
}

async function pasarPor(bytes: Uint8Array, flujo: { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> }): Promise<Uint8Array> {
  const escritor = flujo.writable.getWriter();
  // Sin esperar (lector y escritor van a la vez); un código roto rechaza aquí y en la lectura.
  escritor.write(bytes).catch(() => undefined);
  escritor.close().catch(() => undefined);
  const buf = await new Response(flujo.readable).arrayBuffer();
  return new Uint8Array(buf);
}

/* ── código ───────────────────────────────────────────────────────────────────────────────── */

/** Convierte los datos de emparejado en un código de texto (comprimido si se puede). */
export async function codificarCodigo(datos: DatosCodigo): Promise<string> {
  const json = JSON.stringify({ v: 1, r: datos.r, s: datos.s, sdp: datos.sdp, ...(datos.n ? { n: datos.n.slice(0, 60) } : {}) });
  const bytes = new TextEncoder().encode(json);
  if (puedeComprimir()) {
    try {
      const z = await pasarPor(bytes, new CompressionStream("deflate-raw") as unknown as { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> });
      return `${PREFIJO_CODIGO}z.${aBase64Url(z)}`;
    } catch {
      /* cae al formato sin comprimir */
    }
  }
  return `${PREFIJO_CODIGO}u.${aBase64Url(bytes)}`;
}

/** Saca el código de un texto pegado (o devuelve null si no hay ninguno). */
export function extraerCodigo(texto: string): string | null {
  const m = RE_CODIGO.exec(String(texto ?? ""));
  return m ? m[0] : null;
}

/** Lee un código (o un texto que lo contenga). Nunca lanza: dice por qué no vale. */
export async function decodificarCodigo(texto: string): Promise<ResultadoDecodificar> {
  const codigo = extraerCodigo(texto);
  if (!codigo) return { ok: false, motivo: "No hay ningún código de StarSeed en ese texto." };
  const comprimido = codigo.charAt(PREFIJO_CODIGO.length) === "z";
  const cuerpo = codigo.slice(PREFIJO_CODIGO.length + 2);
  let bytes: Uint8Array;
  try {
    bytes = deBase64Url(cuerpo);
  } catch {
    return { ok: false, motivo: "El código está incompleto o mal copiado." };
  }
  if (comprimido) {
    if (!puedeComprimir()) return { ok: false, motivo: "Este navegador no sabe descomprimir el código (actualízalo)." };
    try {
      bytes = await pasarPor(bytes, new DecompressionStream("deflate-raw") as unknown as { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> });
    } catch {
      return { ok: false, motivo: "El código está incompleto o mal copiado." };
    }
  }
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return { ok: false, motivo: "El código está incompleto o mal copiado." };
  }
  if (!o || typeof o !== "object" || o.v !== 1) return { ok: false, motivo: "Código de una versión que este aparato no entiende." };
  if (o.r !== "o" && o.r !== "a") return { ok: false, motivo: "Código sin tipo (oferta o respuesta)." };
  if (typeof o.s !== "string" || !o.s || o.s.length > 64) return { ok: false, motivo: "Código sin sesión válida." };
  if (typeof o.sdp !== "string" || !o.sdp.startsWith("v=0") || o.sdp.length > MAX_SDP) {
    return { ok: false, motivo: "El código no trae una descripción de red válida." };
  }
  return {
    ok: true,
    datos: { r: o.r, s: o.s, sdp: o.sdp, ...(typeof o.n === "string" && o.n ? { n: o.n.slice(0, 60) } : {}) },
  };
}

/** Candidatos de red que trae un SDP (0 = este aparato no está en ninguna red local). */
export function contarCandidatos(sdp: string): number {
  return (String(sdp).match(/^a=candidate:/gm) ?? []).length;
}
