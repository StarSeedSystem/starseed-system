#!/usr/bin/env node
/**
 * Proxy de VoiceStudio — funciones PURAS o con fetch inyectable.
 * Motor único «Voz StarSeed» (cuatro niveles). Descubrimiento:
 * GET del .well-known cada 60 s como mucho, con caché.
 */

export const DESCUBIERTO_CACHE_MS = 60_000;

export function detectar(fetchImpl) {
  return { ok: false };
}

export function reenvio(ruta, cuerpo, fetchImpl) {
  return { ok: false, error: "no permitido" };
}

export function estado() {
  return { ok: false };
}
