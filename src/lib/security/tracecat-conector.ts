// src/lib/security/tracecat-conector.ts · INF1025B · Ola 1025R (infra)
// Conector hacia el webhook de Tracecat: PREPARA la petición firmada, NUNCA la envía.
// Módulo PURO: sin red, sin disco y sin reloj (el reloj entra por `ahoraMs`). Nada de
// `node:*`: la firma usa `globalThis.crypto.subtle`, que existe en navegador y en Node.
// Cuando de verdad se envíe (INF1026), el envío debe pasar por `safeFetch` de
// `src/lib/security/ssrf.ts`: aquí NO se resuelve DNS ni se comprueba la IP de destino.
// La URL completa del webhook la lee quien llama de una variable de entorno; este
// módulo no supone ninguna ruta concreta. Los secretos solo viven en el entorno.
import type { EventoSeguridad } from "./eventos-seguridad";

const TOPE_CUERPO_BYTES = 16 * 1024;
const TOPE_URL = 2048;
const MIN_SECRETO = 16;
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

export type ResultadoDestino = { ok: true; url: URL } | { ok: false; motivo: string };
export interface OpcionesDestino { permitirRedLocal?: boolean }
export interface EnvioPreparado { method: "POST"; headers: Record<string, string>; body: string }
export type ResultadoEnvio = { ok: true; url: URL; init: EnvioPreparado } | { ok: false; motivo: string };

// confirmar contra la documentación de webhooks de Tracecat al conectar.
export const CABECERAS_TRACECAT = {
  contenido: "content-type", marca: "x-starseed-marca",
  firma: "x-starseed-firma", idempotencia: "idempotency-key",
} as const;

function esHostLocal(host: string): boolean {
  return HOSTS_LOCALES.has(host) || host.endsWith(".local");
}

/** Valida el destino sin resolver DNS: solo https, o http local con permiso explícito. */
export function validarDestino(url: string, opciones: OpcionesDestino = {}): ResultadoDestino {
  if (typeof url !== "string" || url.length === 0) return { ok: false, motivo: "La URL del webhook está vacía." };
  if (url.length > TOPE_URL) return { ok: false, motivo: `La URL supera el tope de ${TOPE_URL} caracteres.` };
  let destino: URL;
  try { destino = new URL(url); } catch { return { ok: false, motivo: "La URL del webhook no es válida." }; }
  if (destino.username || destino.password) return { ok: false, motivo: "La URL no puede llevar credenciales." };
  if (destino.hash) return { ok: false, motivo: "La URL no puede llevar fragmento." };
  if (destino.protocol === "https:") return { ok: true, url: destino };
  if (destino.protocol === "http:" && opciones.permitirRedLocal && esHostLocal(destino.hostname)) return { ok: true, url: destino };
  return { ok: false, motivo: "Solo se admite https: (o http: hacia localhost, 127.0.0.1 o *.local con permiso explícito de red local)." };
}

function aHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Firma HMAC-SHA-256 sobre `${marca}.${cuerpo}`; la marca son segundos Unix. */
export async function firmarCuerpo(cuerpo: string, secreto: string, ahoraMs: number): Promise<{ marca: string; firma: string }> {
  if (typeof secreto !== "string" || secreto.length < MIN_SECRETO) throw new Error(`El secreto de firma de Tracecat debe tener al menos ${MIN_SECRETO} caracteres.`);
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) throw new Error("El instante para firmar el envío no es válido.");
  const marca = String(Math.floor(ahoraMs / 1000));
  const codificador = new TextEncoder();
  const clave = await globalThis.crypto.subtle.importKey("raw", codificador.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await globalThis.crypto.subtle.sign("HMAC", clave, codificador.encode(`${marca}.${cuerpo}`));
  return { marca, firma: aHex(firma) };
}

/** Prepara (no envía) un POST firmado y con clave de idempotencia. */
export async function prepararEnvio(evento: EventoSeguridad, destino: string, secreto: string, ahoraMs: number): Promise<ResultadoEnvio> {
  if (!evento || typeof evento.id !== "string" || evento.id.length === 0) return { ok: false, motivo: "El evento no tiene identificador para la clave de idempotencia." };
  const validado = validarDestino(destino);
  if (!validado.ok) return validado;
  const cuerpo = JSON.stringify(evento);
  const bytes = new TextEncoder().encode(cuerpo).length;
  if (bytes > TOPE_CUERPO_BYTES) return { ok: false, motivo: `El cuerpo supera el tope de ${TOPE_CUERPO_BYTES} bytes (${bytes}).` };
  let firmado: { marca: string; firma: string };
  try { firmado = await firmarCuerpo(cuerpo, secreto, ahoraMs); }
  catch (error) { return { ok: false, motivo: error instanceof Error ? error.message : "No se pudo firmar el cuerpo del envío." }; }
  return {
    ok: true,
    url: validado.url,
    init: {
      method: "POST",
      headers: {
        [CABECERAS_TRACECAT.contenido]: "application/json",
        [CABECERAS_TRACECAT.marca]: firmado.marca,
        [CABECERAS_TRACECAT.firma]: firmado.firma,
        [CABECERAS_TRACECAT.idempotencia]: evento.id,
      },
      body: cuerpo,
    },
  };
}

/** Texto para personas: qué saldría, sin el secreto y con la firma recortada. */
export async function describirEnvio(evento: EventoSeguridad, destino: string, secreto: string, ahoraMs: number): Promise<string> {
  const preparado = await prepararEnvio(evento, destino, secreto, ahoraMs);
  if (!preparado.ok) return `No se preparó ningún envío a Tracecat: ${preparado.motivo}`;
  const firma = preparado.init.headers[CABECERAS_TRACECAT.firma];
  return `Se prepararía un envío POST a Tracecat en ${preparado.url.host} con el evento «${evento.tipo}» (id ${evento.id}); la firma empieza por ${firma.slice(0, 6)}… y no se ha enviado nada.`;
}
