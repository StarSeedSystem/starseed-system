import "server-only";

/**
 * CUSTODIA EN SERVIDOR de credenciales de almacenamiento externo (Ola 374).
 * ============================================================================
 * Antes (Adendas 194-198) el `refresh_token` de Google Drive vivía en
 * localStorage del NAVEGADOR — por dispositivo, nunca compartido entre
 * neuronas de la misma cuenta, y expuesto a cualquier XSS de esa pestaña.
 * Este módulo es SOLO DE SERVIDOR (usa `node:crypto`; nunca lo importa un
 * componente de cliente) y guarda el refresh token SIEMPRE cifrado en la
 * tabla `storage_credentials` (migración `20260927100000_storage_credentials`),
 * una fila por (usuario, proveedor).
 *
 * CIFRADO — AES-256-GCM, clave derivada por HKDF-SHA256 de
 * `SUPABASE_SERVICE_ROLE_KEY` (info "starseed-credenciales-v1"). Deliberado:
 * NINGUNA variable de entorno nueva — la clave de servicio YA es un secreto
 * que solo el servidor conoce y que rota junto con el proyecto Supabase.
 * ⚠️ Rotar `SUPABASE_SERVICE_ROLE_KEY` invalida todo lo cifrado con la clave
 * derivada de la anterior: las cuentas conectadas tendrían que reconectar
 * Google Drive. Es una contrapartida aceptada a cambio de cero secretos
 * nuevos que gestionar/filtrar.
 *
 * RLS de `storage_credentials`: ENABLED y SIN POLÍTICAS (ni para `anon` ni
 * para `authenticated`) — solo `service_role` la toca, y solo desde este
 * módulo, que además NUNCA expone el refresh token en claro a quien lo llama
 * (`leerCredencial` devuelve el texto plano para uso INTERNO del servidor;
 * las rutas HTTP que envuelven este módulo jamás lo reenvían al navegador).
 */

import { createHmac, createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ── Cliente service-role (mismo patrón que /api/dispositivo/sesion) ────── */

function loadServerEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sin .env.local (Vercel/Cloud Run traen las env vars ya inyectadas) */
  }
  return out;
}
const SERVER_ENV = loadServerEnv();

function envVar(name: string): string | undefined {
  return process.env[name] || SERVER_ENV[name];
}

let cachedClient: SupabaseClient | null = null;

/** Cliente Supabase con `service_role` (bypasea RLS). `null` si falta config. */
function serviceClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = envVar("NEXT_PUBLIC_SUPABASE_URL");
  const key = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cachedClient = createSbClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/* ── Cifrado AES-256-GCM (HKDF desde SUPABASE_SERVICE_ROLE_KEY) ─────────── */

const HKDF_INFO = "starseed-credenciales-v1";
const IV_LEN = 12; // recomendado para GCM
const TAG_LEN = 16;
const FORMATO = "v1"; // prefijo de versión, por si el esquema cambia algún día

/**
 * Clave AES-256 derivada de `SUPABASE_SERVICE_ROLE_KEY` vía HKDF-SHA256. Falla
 * cerrado (lanza) si no hay clave de servicio configurada: nunca se cifra con
 * una clave débil/constante de reserva.
 */
function derivarClave(): Buffer {
  const secreto = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!secreto) {
    throw new Error(
      "credenciales-servidor: falta SUPABASE_SERVICE_ROLE_KEY; no hay secreto de servidor " +
        "para derivar la clave de cifrado (fallo cerrado por seguridad).",
    );
  }
  // hkdfSync devuelve un ArrayBuffer; 32 bytes = AES-256.
  const salt = createHmac("sha256", "starseed-storage-credentials-salt").update(secreto).digest();
  return Buffer.from(hkdfSync("sha256", secreto, salt, HKDF_INFO, 32));
}

/**
 * Cifra un texto (típicamente un refresh token) a un string opaco
 * `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`. Nunca lanza salvo por falta de
 * clave de servidor (ver `derivarClave`).
 */
export function cifrar(texto: string): string {
  const clave = derivarClave();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", clave, iv);
  const ciphertext = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMATO, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Descifra lo producido por `cifrar`. Lanza `Error` con mensaje claro si el
 * formato es inválido o la etiqueta de autenticación no coincide (dato
 * manipulado/corrupto o clave de servicio distinta a la que cifró) — NUNCA
 * devuelve un texto parcial o silencioso ante manipulación.
 */
export function descifrar(cifrado: string): string {
  const partes = cifrado.split(":");
  if (partes.length !== 4 || partes[0] !== FORMATO) {
    throw new Error("credenciales-servidor: formato de credencial cifrada no reconocido.");
  }
  const [, ivB64, tagB64, dataB64] = partes;
  const clave = derivarClave();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("credenciales-servidor: credencial cifrada corrupta (longitud de iv/tag inválida).");
  }
  const decipher = createDecipheriv("aes-256-gcm", clave, iv);
  decipher.setAuthTag(tag);
  try {
    const texto = Buffer.concat([decipher.update(data), decipher.final()]);
    return texto.toString("utf8");
  } catch {
    // GCM: la etiqueta no verifica → manipulado, corrupto o cifrado con otra clave.
    throw new Error("credenciales-servidor: no se pudo verificar la credencial cifrada (manipulada o clave distinta).");
  }
}

/* ── Filas de storage_credentials ────────────────────────────────────────── */

export type ProveedorAlmacenamiento = "google-drive";

export interface CredencialAlmacenamiento {
  userId: string;
  proveedor: ProveedorAlmacenamiento;
  cuentaEmail: string | null;
  alcance: string | null;
  actualizado: string;
}

/** Guarda (upsert) el refresh token cifrado de un usuario/proveedor. */
export async function guardarCredencial(input: {
  userId: string;
  proveedor: ProveedorAlmacenamiento;
  refreshToken: string;
  cuentaEmail?: string | null;
  alcance?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Falta configuración de Supabase en el servidor (service_role)." };
  try {
    const { error } = await sb.from("storage_credentials").upsert(
      {
        user_id: input.userId,
        proveedor: input.proveedor,
        refresh_cifrado: cifrar(input.refreshToken),
        cuenta_email: input.cuentaEmail ?? null,
        alcance: input.alcance ?? null,
        actualizado: new Date().toISOString(),
      },
      { onConflict: "user_id,proveedor" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error al guardar la credencial." };
  }
}

/** Lee la fila de un usuario/proveedor y devuelve el refresh token EN CLARO
 *  (solo para uso interno del servidor: renovar/desconectar). Nunca sale de
 *  este proceso hacia el navegador. */
export async function leerCredencial(
  userId: string,
  proveedor: ProveedorAlmacenamiento,
): Promise<{ refreshToken: string; cuentaEmail: string | null; alcance: string | null } | null> {
  const sb = serviceClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("storage_credentials")
      .select("refresh_cifrado,cuenta_email,alcance")
      .eq("user_id", userId)
      .eq("proveedor", proveedor)
      .maybeSingle();
    if (error || !data) return null;
    const refreshToken = descifrar(data.refresh_cifrado as string);
    return {
      refreshToken,
      cuentaEmail: (data.cuenta_email as string | null) ?? null,
      alcance: (data.alcance as string | null) ?? null,
    };
  } catch {
    return null; // corrupta/manipulada/clave rotada: se trata como "no conectado" (hay que reconectar)
  }
}

/** ¿Hay una credencial guardada? (sin descifrar: para "estado" honesto). */
export async function estadoCredencial(
  userId: string,
  proveedor: ProveedorAlmacenamiento,
): Promise<{ conectado: boolean; cuentaEmail: string | null }> {
  const sb = serviceClient();
  if (!sb) return { conectado: false, cuentaEmail: null };
  try {
    const { data } = await sb
      .from("storage_credentials")
      .select("cuenta_email")
      .eq("user_id", userId)
      .eq("proveedor", proveedor)
      .maybeSingle();
    return { conectado: !!data, cuentaEmail: (data?.cuenta_email as string | null) ?? null };
  } catch {
    return { conectado: false, cuentaEmail: null };
  }
}

/** Borra la fila (desconectar). Idempotente: no falla si ya no existía. */
export async function borrarCredencial(userId: string, proveedor: ProveedorAlmacenamiento): Promise<boolean> {
  const sb = serviceClient();
  if (!sb) return false;
  try {
    await sb.from("storage_credentials").delete().eq("user_id", userId).eq("proveedor", proveedor);
    return true;
  } catch {
    return false;
  }
}
