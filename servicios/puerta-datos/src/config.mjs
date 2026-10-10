// Configuración de la puerta de datos. Todo por variables de entorno (valores en
// /etc/starseed/puerta-datos.env, root:starseed 640); aquí solo hay NOMBRES y valores por defecto.
// Contrato: architecture/puerta-datos-a1.md §4.

import { readFileSync } from "node:fs";

export const VERSION = "1.0.0";

/** Orígenes del OS que pueden llamar desde un navegador (sin cookies). */
export const ORIGENES_POR_DEFECTO = Object.freeze([
  "https://starseed-os.vercel.app",
  "http://localhost:9002",
  "http://127.0.0.1:9002",
  "http://localhost:3000",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "capacitor://localhost",
]);

function entero(valor, defecto, min, max) {
  const n = Number.parseInt(String(valor ?? ""), 10);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(max, Math.max(min, n));
}

function leerHost(ruta) {
  try {
    const h = readFileSync(ruta, "utf8").trim();
    return /^[a-z0-9.-]{4,200}$/i.test(h) ? h : "";
  } catch {
    return "";
  }
}

export function leerConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const extra = String(env.PUERTA_ORIGENES || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^(https?|tauri|capacitor):\/\/[^\s/]+$/.test(s));
  const host = String(env.PUERTA_HOST_PUBLICO || "").trim() ||
    (() => {
      const base = leerHost(env.PUERTA_ARCHIVO_HOST || "/etc/starseed/host");
      return base ? `datos.${base}` : "";
    })();
  return {
    version: VERSION,
    escucha: String(env.PUERTA_ESCUCHA || "127.0.0.1"),
    puerto: entero(env.PUERTA_PUERTO, 8791, 1, 65535),
    dirDatos: String(env.PUERTA_DIR || "/var/lib/starseed/puerta-datos"),
    archivoFichas: String(env.PUERTA_FICHAS || "/etc/starseed/puerta-datos/tokens.json"),
    supabaseUrl,
    supabaseAnon: String(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
    llaveReplica: String(env.PUERTA_LLAVE_REPLICA || "").trim(),
    origenes: [...new Set([...ORIGENES_POR_DEFECTO, ...extra])],
    replicaDia: entero(env.PUERTA_REPLICA_DIA, 1500, 0, 20000),
    replicaCadaMs: entero(env.PUERTA_REPLICA_CADA_S, 300, 30, 3600) * 1000,
    caddyAdmin: String(env.PUERTA_CADDY_ADMIN || "http://localhost:2019").replace(/\/+$/, ""),
    hostPublico: host,
    reconciliarCaddy: String(env.PUERTA_CADDY || "1") !== "0",
  };
}

/** Lo que se puede enseñar de la configuración (nunca valores secretos ni el host). */
export function resumenConfig(c) {
  return {
    version: c.version,
    puerto: c.puerto,
    supabase: Boolean(c.supabaseUrl && c.supabaseAnon),
    replica: Boolean(c.llaveReplica),
    replicaDia: c.replicaDia,
    host: Boolean(c.hostPublico),
  };
}
