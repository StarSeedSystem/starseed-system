/**
 * Bóveda de claves del origen del cruce Genesis.
 * Esta capa almacena las claves cifradas en las tablas del proyecto.
 *
 * Funciones exportadas:
 *   - guardarClave(ambito, proveedor, valor) → guarda la clave cifrada.
 *   - prestarClave(deAmbito, aAmbito, {tope, caduca}) → mueve una clave a otro ámbito.
 *   - usarClave(ambito, proveedor, fn) → recupera la clave y la pasa a la función.
 *   - revocar(ambito, proveedor) → elimina la clave.
 */

import { createHmac, createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from "node:crypto";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con rol service_role.
 * Se reutiliza el patrón del módulo de credenciales-servidor.
 */

const SERVER_ENV: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  try {
    const data = require("fs").readFileSync(process.cwd() + "/.env.local", "utf8");
    for (const line of data.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    /* ignore */
  }
  return out;
})();

function envVar(name: string): string | undefined {
  return process.env[name] || SERVER_ENV[name];
}

let cachedClient: SupabaseClient | null = null;
function serviceClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = envVar("NEXT_PUBLIC_SUPABASE_URL");
  const key = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cachedClient = createSbClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/**
 * Deriva una clave AES-256 a partir de SUPABASE_SERVICE_ROLE_KEY usando HKDF SHA-256.
 */
function derivarClave(): Buffer {
  const secreto = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!secreto) throw new Error("clave de servicio no encontrada");
  const salt = createHmac("sha256", "starseed-genesis-credenciales-salt").update(secreto).digest();
  return Buffer.from(hkdfSync("sha256", secreto, salt, "starseed-credenciales-v1", 32));
}

/**
 * Cifra un valor usando AES-256-GCM.
 */
function cifrar(texto: string): string {
  const key = derivarClave();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

function descifrar(cifrado: string): string {
  const partes = cifrado.split(":");
  if (partes.length !== 4 || partes[0] !== "v1") throw new Error("boveda-servidor: formato no reconocido");
  const [, ivB64, tagB64, dataB64] = partes;
  const key = derivarClave();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Fingerprint de la clave para rev/huella.
 */
function huella(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/**
 * Guarda una clave cifrada.
 */
export async function guardarClave(
  ambito: string,
  proveedor: string,
  valor: string,
  tope: number = 0,
  caduca?: Date
): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Supabase no configurado" };
  const cifrado = cifrar(valor);
  const payload = {
    ambito_id: ambito,
    proveedor,
    cifrado,
    huella: huella(valor),
    tope,
    caduca: caduca?.toISOString() ?? null,
    creada_por: null,
    prestada_por: null,
  };
  try {
    const { error } = await sb.from("genesis_boveda").upsert(payload, { onConflict: "ambito_id,proveedor" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { ok: false, error: mensaje };
  }
}

/**
 * Presta una clave de un ámbito a otro.
 */
export async function prestarClave(
  deAmbito: string,
  aAmbito: string,
  opts: { tope?: number; caduca?: Date } = {}
): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Supabase no configurado" };
  try {
    const { data, error } = await sb
      .from("genesis_boveda")
      .select("cifrado,proveedor,huella,tope,caduca,prestada_por,creada_por")
      .eq("ambito_id", deAmbito)
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? "no encontrada" };
    // insertar nuevo
    const nuevo: Record<string, string | number | null> = {
      ambito_id: aAmbito,
      proveedor: data.proveedor,
      cifrado: data.cifrado,
      huella: data.huella,
      tope: (opts.tope ?? data.tope) as number,
      caduca: (opts.caduca?.toISOString() ?? data.caduca) as string | null,
      prestada_por: deAmbito,
      creada_por: data.creada_por ?? null,
    };
    const { error: errUp } = await sb.from("genesis_boveda").upsert(nuevo, { onConflict: "ambito_id,proveedor" });
    if (errUp) return { ok: false, error: errUp.message };
    return { ok: true };
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { ok: false, error: mensaje };
  }
}

/**
 * Usa una clave dentro de una función proporcionada.
 */
export async function usarClave(
  ambito: string,
  proveedor: string,
  fn: (valor: string) => void
): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Supabase no configurado" };
  try {
    const { data, error } = await sb
      .from("genesis_boveda")
      .select("cifrado,proveedor")
      .eq("ambito_id", ambito)
      .eq("proveedor", proveedor)
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? "no encontrada" };
    const valor = descifrar(data.cifrado);
    fn(valor);
    return { ok: true };
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { ok: false, error: mensaje };
  }
}

/**
 * Revoca (elimina) una clave.
 */
export async function revocar(
  ambito: string,
  proveedor: string
): Promise<boolean> {
  const sb = serviceClient();
  if (!sb) return false;
  try {
    await sb.from("genesis_boveda").delete().eq("ambito_id", ambito).eq("proveedor", proveedor);
    return true;
  } catch {
    return false;
  }
}
