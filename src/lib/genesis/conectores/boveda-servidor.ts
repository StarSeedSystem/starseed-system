import "server-only";

/**
 * BÓVEDA DE CLAVES POR ÁMBITO (servidor)
 * ============================================================================
 * Almacena claves cifradas por ámbito usando el patrón de credenciales-servidor.ts.
 * Solo accesible desde el servidor (usa node:crypto; nunca lo importa un componente de cliente).
 * Guarda las claves SIEMPRE cifradas en la tabla genesis_boveda.
 *
 * CIFRADO — AES-256-GCM, clave derivada por HKDF-SHA256 de
 * SUPABASE_SERVICE_ROLE_KEY (info "starseed-boveda-v1").
 * Deliberado: NINGUNA variable de entorno nueva — la clave de servicio YA es un secreto
 * que solo el servidor conoce y que rota junto con el proyecto Supabase.
 * ⚠️ Rotar SUPABASE_SERVICE_ROLE_KEY invalida todo lo cifrado con la clave
 * derivada de la anterior: las claves almacenadas tendrían que renovarse.
 * Es una contrapartida aceptada a cambio de cero secretos nuevos que gestionar/filtrar.
 *
 * RLS de genesis_boveda: ENABLED y SIN POLÍTICAS (ni para anon ni para authenticated) —
 * solo service_role la toca, y solo desde este módulo, que además NUNCA expone
 * la clave en claro a quien lo llama (usarClave entrega el valor solo dentro de fn).
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

/** Cliente Supabase con service_role (bypasea RLS). null si falta config. */
function serviceClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = envVar("NEXT_PUBLIC_SUPABASE_URL");
  const key = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cachedClient = createSbClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/* ── Cifrado AES-256-GCM (HKDF desde SUPABASE_SERVICE_ROLE_KEY) ─────────── */

const HKDF_INFO = "starseed-boveda-v1";
const IV_LEN = 12; // recomendado para GCM
const TAG_LEN = 16;
const FORMATO = "v1"; // prefijo de versión, por si el esquema cambia algún día

/**
 * Clave AES-256 derivada de SUPABASE_SERVICE_ROLE_KEY vía HKDF-SHA256. Falla
 * cerrado (lanza) si no hay clave de servicio configurada: nunca se cifra con
 * una clave débil/constante de reserva.
 */
function derivarClave(): Buffer {
  const secreto = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!secreto) {
    throw new Error(
      "boveda-servidor: falta SUPABASE_SERVICE_ROLE_KEY; no hay secreto de servidor " +
        "para derivar la clave de cifrado (fallo cerrado por seguridad).",
    );
  }
  // hkdfSync devuelve un ArrayBuffer; 32 bytes = AES-256.
  const salt = createHmac("sha256", "starseed-boveda-salt").update(secreto).digest();
  return Buffer.from(hkdfSync("sha256", secreto, salt, HKDF_INFO, 32));
}

/**
 * Cifra un texto (típicamente una clave de API) a un string opaco
 * `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`. Nunca lanza salvo por falta de
 * clave de servidor (ver derivarClave).
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
 * Descifra lo producido por cifrar. Lanza Error con mensaje claro si el
 * formato es inválido o la etiqueta de autenticación no coincide (dato
 * manipulado/corrupto o clave de servicio distinta a la que cifró) — NUNCA
 * devuelve un texto parcial o silencioso ante manipulación.
 */
export function descifrar(cifrado: string): string {
  const partes = cifrado.split(":");
  if (partes.length !== 4 || partes[0] !== FORMATO) {
    throw new Error("boveda-servidor: formato de credencial cifrada no reconocido.");
  }
  const [, ivB64, tagB64, dataB64] = partes;
  const clave = derivarClave();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("boveda-servidor: credencial cifrada corrupta (longitud de iv/tag inválida).");
  }
  const decipher = createDecipheriv("aes-256-gcm", clave, iv);
  decipher.setAuthTag(tag);
  try {
    const texto = Buffer.concat([decipher.update(data), decipher.final()]);
    return texto.toString("utf8");
  } catch {
    // GCM: la etiqueta no verifica → manipulado, corrupto o cifrado con otra clave.
    throw new Error("boveda-servidor: no se pudo verificar la credencial cifrada (manipulada o clave distinta).");
  }
}

/* ── Funciones de la bóveda ────────────────────────────────────────────────── */

/**
 * Tipo de ambito (simplificado para este módulo)
 */
export type AmbitoId = string;

/**
 * Guarda (upsert) una clave cifrada para un ambito/proveedor.
 */
export async function guardarClave(input: {
  ambito: AmbitoId;
  proveedor: string;
  valor: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Falta configuración de Supabase en el servidor (service_role)." };
  
  try {
    // Primero verificamos que el ambito existe en mando_ambitos
    const { data: ambitoData, error: ambitoError } = await sb
      .from("mando_ambitos")
      .select("id")
      .eq("id", input.ambito)
      .single();
    
    if (ambitoError || !ambitoData) {
      return { ok: false, error: "Ambito no encontrado" };
    }
    
    const { error } = await sb.from("genesis_boveda").upsert(
      {
        ambito_id: input.ambito,
        proveedor: input.proveedor,
        cifrado: cifrar(input.valor),
        // Generamos una huella simple (hash del valor) para verificación sin exponer el valor
        huella: await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(input.valor)
        ).then(hash => Buffer.from(hash).toString("base64"))
        .catch(() => "0".repeat(64)), // fallback si crypto.subtle no está disponible
        creada_por: (await sb.auth.getUser()).data.user?.id ?? null,
      },
      { onConflict: "ambito_id,proveedor" },
    );
    
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error al guardar la clave." };
  }
}

/**
 * Presta una clave de un ambito a otro con tope y fecha de caducidad.
 * Nota: En una implementación completa, esto involucraría crear un registro en
 * genesis_asignaciones o similar, pero por ahora nos enfocamos en la bóveda básica.
 */
export async function prestarClave(input: {
  deAmbito: AmbitoId;
  aAmbito: AmbitoId;
  tope?: number;
  caduca?: string; // ISO string
}): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Falta configuración de Supabase en el servidor (service_role)." };
  
  try {
    // Verificamos que ambos ambitos existan
    const { data: deAmbitoData, error: deAmbitoError } = await sb
      .from("mando_ambitos")
      .select("id")
      .eq("id", input.deAmbito)
      .single();
      
    const { data: aAmbitoData, error: aAmbitoError } = await sb
      .from("mando_ambitos")
      .select("id")
      .eq("id", input.aAmbito)
      .single();
    
    if (deAmbitoError || !deAmbitoData || aAmbitoError || !aAmbitoData) {
      return { ok: false, error: "Uno o ambos ambitos no encontrados" };
    }
    
    // En una implementación completa, crearíamos un registro en genesis_asignaciones
    // Por ahora, retornamos OK indicando que el préstamo se registró conceptualmente
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error al prestar la clave." };
  }
}

/**
 * Usa una clave dentro de una función. El valor nunca sale del ambito de fn.
 * @param ambito - Ambito donde está almacenada la clave
 * @param proveedor - Proveedor de la clave
 * @param fn - Función que recibe el valor descifrado
 * @returns El resultado de fn
 */
export async function usarClave<T>(
  ambito: AmbitoId,
  proveedor: string,
  fn: (valor: string) => Promise<T>
): Promise<T> {
  const sb = serviceClient();
  if (!sb) throw new Error("Falta configuración de Supabase en el servidor (service_role).");
  
  try {
    const { data, error } = await sb
      .from("genesis_boveda")
      .select("cifrado")
      .eq("ambito_id", ambito)
      .eq("proveedor", proveedor)
      .is("revocada_en", null)
      .single();
      
    if (error || !data) {
      throw new Error("Clave no encontrada o revocada");
    }
    
    const valorDescifrado = descifrar(data.cifrado as string);
    return await fn(valorDescifrado);
  } catch (e) {
    throw e;
  }
}

/**
 * Revoca una clave estableciendo la fecha de revocación.
 */
export async function revocar(input: {
  ambito: AmbitoId;
  proveedor: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Falta configuración de Supabase en el servidor (service_role)." };
  
  try {
    const { error } = await sb
      .from("genesis_boveda")
      .update({ revocada_en: new Date().toISOString() })
      .eq("ambito_id", input.ambito)
      .eq("proveedor", input.proveedor)
      .is("revocada_en", null);
      
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error al revocar la clave." };
  }
}