// src/lib/security/tracecat-conector.ts · INF1025B · Ola 1025R (infra)
// Conector que PREPARA (nunca envía) la petición hacia el webhook de Tracecat,
// el orquestador de respuesta autoalojado (AGPL-3.0). El envío real (INF1026)
// deberá salir por `safeFetch` de src/lib/security/ssrf.ts: fijar la IP, anular
// SSRF, revalidar destino y resolver DNS ahí. Aquí solo se compone y firma
// (HMAC-SHA-256 con `globalThis.crypto.subtle`, nada de `node:crypto`).
// URL y secreto en variables del SERVIDOR (`TRACECAT_WEBHOOK_URL`,
// `TRACECAT_WEBHOOK_SECRET`; jamás en el navegador). Módulo PURO: no lee
// `process.env`, sin red, disco ni reloj: todo por parámetro.
import type { EventoSeguridad } from "./eventos-seguridad";

/** Cabeceras PROPUESTAS: confirmar contra la documentación de webhooks de Tracecat al conectar. */
export const CABECERAS_TRACECAT = {
  tipo: "content-type",
  marca: "x-starseed-marca",
  firma: "x-starseed-firma",
  idempotencia: "idempotency-key",
} as const;

/** Tope del cuerpo JSON: 16 KB. */
export const TOPE_BYTES = 16 * 1024;

export type ResultadoDestino = { ok: true; url: URL } | { ok: false; motivo: string };

export type FirmaCuerpo = { marca: string; firma: string };

export type EnvioPreparado =
  | { ok: true; url: string; init: { method: "POST"; headers: Record<string, string>; body: string } }
  | { ok: false; motivo: string };

/** Valida el destino: solo `https:` (o `http:` red local con `permitirRedLocal`),
 *  sin credenciales en la URL, sin fragmento y de ≤ 2048 caracteres. */
export function validarDestino(url: string, opciones?: { permitirRedLocal?: boolean }): ResultadoDestino {
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return { ok: false, motivo: "La URL del webhook no es válida." };
  }
  if (destino.username || destino.password) return { ok: false, motivo: "La URL no debe llevar credenciales dentro." };
  if (destino.hash) return { ok: false, motivo: "La URL no debe llevar fragmento (#)." };
  if (url.length > 2048) return { ok: false, motivo: "La URL es demasiado larga (tope de 2048 caracteres)." };
  if (destino.protocol === "https:") return { ok: true, url: destino };
  if (destino.protocol === "http:" && opciones?.permitirRedLocal) {
    const host = destino.hostname.toLowerCase();
    const esLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
    if (esLocal) return { ok: true, url: destino };
  }
  return { ok: false, motivo: "Solo https:, o http: hacia tu red local (localhost, 127.0.0.1 o *.local) si la autorizas." };
}

/** Firma `marca.cuerpo` con HMAC-SHA-256 (Web): segundos Unix y hex minúscula. */
export async function firmarCuerpo(cuerpo: string, secreto: string, ahoraMs: number): Promise<FirmaCuerpo> {
  if (typeof secreto !== "string" || secreto.length < 16)
    throw new Error("El secreto del webhook hace falta y debe tener al menos 16 caracteres.");
  if (!Number.isFinite(ahoraMs)) throw new Error("La marca de tiempo debe ser un número finito.");
  const marca = Math.floor(ahoraMs / 1000).toString();
  const clave = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await globalThis.crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(`${marca}.${cuerpo}`));
  const firma = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
  return { marca, firma };
}

/** Prepara (NUNCA envía) la petición firmada: POST JSON de ≤ 16 KB con
 *  `idempotency-key` = `evento.id` (Tracecat deduplica); enviar es de quien llame. */
export async function prepararEnvio(
  evento: EventoSeguridad,
  destino: string,
  secreto: string,
  ahoraMs: number,
): Promise<EnvioPreparado> {
  const visitado = validarDestino(destino);
  if (!visitado.ok) return { ok: false, motivo: visitado.motivo };
  const body = JSON.stringify(evento);
  if (new TextEncoder().encode(body).length > TOPE_BYTES)
    return { ok: false, motivo: "El cuerpo pasa de 16 KB: hazlo más pequeño." };
  let firma: FirmaCuerpo;
  try {
    firma = await firmarCuerpo(body, secreto, ahoraMs);
  } catch {
    return { ok: false, motivo: "No se pudo firmar: falta el secreto del webhook (o es muy corto)." };
  }
  return {
    ok: true,
    url: visitado.url.toString(),
    init: {
      method: "POST",
      headers: {
        [CABECERAS_TRACECAT.tipo]: "application/json",
        [CABECERAS_TRACECAT.marca]: firma.marca,
        [CABECERAS_TRACECAT.firma]: firma.firma,
        [CABECERAS_TRACECAT.idempotencia]: evento.id,
      },
      body,
    },
  };
}

/** Texto para personas con lo que SALDRÍA: sin el secreto, con solo 6 letras de la firma más «…». */
export function describirEnvio(preparado: EnvioPreparado): string {
  if (!preparado.ok) return `No se preparó el envío: ${preparado.motivo}`;
  const h = preparado.init.headers;
  const idem = h[CABECERAS_TRACECAT.idempotencia] ?? "";
  const marca = h[CABECERAS_TRACECAT.marca] ?? "";
  const firma = h[CABECERAS_TRACECAT.firma] ?? "";
  const bytes = new TextEncoder().encode(preparado.init.body).length;
  let host = "";
  try {
    host = new URL(preparado.url).host;
  } catch {
    host = "(destino)";
  }
  return [
    `POST JSON de ${bytes} bytes hacia ${host}`,
    `firmado con HMAC-SHA-256, marca ${marca}`,
    `con firma que empieza por ${firma.slice(0, 6)}… (el secreto nunca viaja ni se muestra)`,
    `y con ${CABECERAS_TRACECAT.idempotencia} ${idem} para que Tracecat deduplique`,
  ].join(", ");
}
