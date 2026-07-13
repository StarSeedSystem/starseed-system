// ════════════════════════════════════════════════════════════════
// Instancias web (Penpot · OpenCut) — conector por URL, sin API
// ----------------------------------------------------------------
// HONESTIDAD RADICAL (la razón de que este cliente exista aparte):
//
// Hay herramientas OSS que NO exponen una API útil para el OS, pero SÍ son
// instancias web reales que el usuario puede tener (oficial o auto-hospedada).
// Para ellas el «conector» es honestamente eso: una URL de instancia que:
//   1) se puede COMPROBAR (¿responde?), y
//   2) se usa para CONSTRUIR ENLACES (abrir el editor, incrustar un diseño).
// Nada más. No fingimos llamadas que no existen.
//
// · PENPOT (MPL-2.0) — plataforma de diseño. Su instancia oficial
//   (design.penpot.app) devuelve **`X-Frame-Options: SAMEORIGIN`** (verificado
//   con `curl -I`): por tanto **NO se puede incrustar en un iframe desde el OS**.
//   El bloque de publicación «Diseño Penpot» renderiza por defecto una TARJETA
//   con enlace, y solo ofrece incrustar cuando el usuario apunta a una instancia
//   PROPIA que él haya configurado para permitirlo. Decirle lo contrario sería
//   mentirle: vería un iframe en blanco.
//
// · OPENCUT (MIT) — editor de vídeo web. Su instancia pública (opencut.app,
//   versión «classic») responde 200 y **no** manda X-Frame-Options (verificado),
//   así que sí es incrustable; pero el editor trabaja con ficheros locales del
//   navegador y **no tiene API** (su «Editor API», modo headless y servidor MCP
//   están anunciados como FUTUROS en su propio README). Por eso el conector solo
//   ABRE el editor y la publicación se hace con el vídeo YA exportado.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, cleanEndpoint } from "./_proxy";

/** Instancia oficial de Penpot (SaaS gratuito del proyecto). */
export const PENPOT_DEFAULT = "https://design.penpot.app";
/** Instancia pública de OpenCut (versión «classic», la usable hoy). */
export const OPENCUT_DEFAULT = "https://opencut.app";

/**
 * ¿Responde la instancia? GET a la raíz a través del proxy (evita CORS).
 * Es una comprobación de ALCANZABILIDAD, no de autenticación: se dice tal cual.
 */
export async function health(id: string, cfg: IntegrationConfig, fallback: string): Promise<IntegrationResult> {
  const endpoint = cleanEndpoint(cfg.endpoint) || fallback;
  const res = await proxyFetch({
    id,
    endpoint,
    method: "GET",
    path: "/",
    auth: "none",
    timeoutMs: 10_000,
  });
  if (res.ok) {
    return { ok: true, data: { endpoint, message: `La instancia responde (${endpoint}).` } };
  }
  return { ok: false, error: `La instancia no responde: ${res.error || "sin respuesta"}.` };
}

/** ¿Es la instancia oficial de Penpot (que NO permite incrustar)? */
export function isPenpotOfficial(url: string): boolean {
  return /(^|\/\/)(design\.)?penpot\.app/i.test((url || "").trim());
}

/**
 * Normaliza un enlace de Penpot. Acepta:
 *   · una URL completa de workspace o de «view» (share link),
 *   · o simplemente el id del fichero (lo compone contra la instancia).
 * Devuelve la URL de VISTA (view mode) cuando puede deducirla — que es la que
 * se comparte públicamente.
 */
export function penpotViewUrl(input: string, instance = PENPOT_DEFAULT): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  const base = cleanEndpoint(instance) || PENPOT_DEFAULT;
  if (/^https?:\/\//i.test(raw)) return raw;
  // Sólo el id del fichero → URL de vista del modo «view» de Penpot.
  if (/^[0-9a-f-]{8,}$/i.test(raw)) return `${base}/#/view?file-id=${encodeURIComponent(raw)}`;
  return `${base}/${raw.replace(/^\/+/, "")}`;
}
