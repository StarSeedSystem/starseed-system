"use client";

/**
 * StarSeed OS — CRL de CERTIFICADOS DE DISPOSITIVO · revocación EXPLÍCITA.
 * ============================================================================
 * Complementa la CADUCIDAD por `iat` de `verifyDeviceCert`: permite RETIRAR el cert
 * de un dispositivo CONCRETO (identificado por su id de DISPOSITIVO estable ·
 * `deviceCertId` = relayDeviceId/deviceFp) SIN revocar la identidad soberana ni la
 * clave maestra. La revocación PERSISTE aunque el dispositivo RE-EMITA su cert en el
 * próximo arranque (no se clava en la firma) — revisión adversarial Adenda 128.
 *
 * El almacén es una lista de revocación (CRL) sobre `os_mesh_relay` con
 * `kind:"device-cert-revocation"` — mismo patrón que la revocación de IDENTIDAD
 * (`kind:"revocation"`) de server-relay.ts. El payload de cada fila es el ACTA
 * firmada por la maestra (`DeviceCertRevocation`). El acta es AUTO-AUTENTICABLE:
 * solo la maestra que emitió el cert puede firmar su revocación, y el ANCLA de
 * confianza (`expectedMfp`) impide que un tercero forje una revocación que retire
 * (DoS) el cert de una víctima.
 *
 * SUPUESTO sobre `expectedMfp` (documentado): es la huella de la clave MAESTRA
 * PROPIA/PINEADA de esta neurona — `masterFingerprint()` de master-identity.ts, o
 * de forma equivalente el ancla `account→mfp` fijada por TOFU (ACCOUNT_MFP_LS en
 * server-relay.ts). Como TODAS las neuronas de una cuenta comparten la MISMA
 * maestra (identidad portátil, se exporta/importa), este ÚNICO ancla cubre los
 * certs de TODOS los dispositivos de la cuenta propia: revocar el cert de un
 * dispositivo propio se honra en las demás neuronas de la cuenta. Verificar
 * revocaciones de OTRAS cuentas contra su propio ancla pineado (una CRL por
 * cuenta) es un SEGUIMIENTO natural — hoy fuera de alcance: la firma toma un solo
 * `expectedMfp`. Es la dirección FAIL-SAFE: sin la revocación de otra cuenta se
 * sigue confiando en su cert un poco más, nunca se rechaza uno legítimo por error.
 *
 * Degradación TOTAL y silenciosa: sin sesión/tabla/red/WebCrypto no hace nada y la
 * malla local sigue igual. NUNCA lanza. Sigue el patrón de acceso a Supabase de
 * server-relay.ts (cliente singleton `@/utils/supabase/client`, owner por sesión).
 */

import {
  deviceCertId,
  signDeviceCertRevocation,
  verifyDeviceCertRevocation,
  type DeviceCert,
  type DeviceCertRevocation,
} from "./master-identity";

/** Canal de las revocaciones: público, como la revocación de identidad (cualquiera la verifica). */
const REVOCATION_CHANNEL = "public";
/** Tope de filas leídas por refresco (acota el trabajo por sondeo, como el `limit(500)` de la de identidad). */
const CRL_READ_LIMIT = 500;

async function client() {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    return createClient();
  } catch {
    return null;
  }
}

async function ownerId(
  supabase: NonNullable<Awaited<ReturnType<typeof client>>>,
): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Set en memoria de `certId` REVOCADOS y verificados. Se reconstruye en cada
 * `refreshDeviceCertRevocations`; se PRESERVA si la lectura falla (no se vacía por un
 * fallo transitorio, igual que `refreshIdentities` preserva su mapa vigente).
 */
let revokedCertIds = new Set<string>();

/**
 * Publica el acta de revocación de UN cert de dispositivo concreto:
 * `deviceCertId(cert)` → `signDeviceCertRevocation` → inserta una fila
 * `kind:"device-cert-revocation"` cuyo payload es el acta. Tolerante a fallos
 * (false si no hay maestra/sesión/WebCrypto o si el servidor rechaza).
 */
export async function publishDeviceCertRevocation(cert: DeviceCert): Promise<boolean> {
  try {
    const certId = await deviceCertId(cert);
    if (!certId) return false;
    const acta = await signDeviceCertRevocation(certId);
    if (!acta) return false; // sin maestra/WebCrypto no se puede firmar el acta
    const supabase = await client();
    if (!supabase) return false;
    const owner = await ownerId(supabase);
    if (!owner) return false;
    const { error } = await supabase.from("os_mesh_relay").insert({
      owner_id: owner,
      channel: REVOCATION_CHANNEL,
      kind: "device-cert-revocation",
      cls: "P3",
      ptype: "manifest",
      enc: false,
      payload: acta,
      expires_at: null, // una revocación no caduca
    });
    if (error) {
      // No tragarse el fallo en silencio: la Adenda 123 documenta cómo un `kind` no permitido
      // por el CHECK dejó la capa de identidad INERTE SIN AVISO. Se avisa y se degrada.
      console.warn("[mesh] publishDeviceCertRevocation: inserción rechazada:", error.message ?? error);
      return false;
    }
    revokedCertIds.add(certId); // efecto local inmediato (como `revokedSet.add` en la de identidad)
    return true;
  } catch {
    return false;
  }
}

/**
 * Refresca el conjunto VERIFICADO de `certId` revocados desde la CRL pública. Lee las
 * filas `kind:"device-cert-revocation"` (tope `CRL_READ_LIMIT`), verifica cada acta con
 * `verifyDeviceCertRevocation(acta, expectedMfp)` y reconstruye el Set en memoria.
 * Tolerante a fallos: si la lectura falla NO vacía el set (preserva lo ya conocido).
 *
 * `expectedMfp`: el ancla maestra PROPIA/PINEADA de esta neurona (ver cabecera del módulo).
 */
export async function refreshDeviceCertRevocations(expectedMfp: string): Promise<void> {
  try {
    if (!expectedMfp) return; // sin ancla no se puede verificar nada: preserva lo conocido
    const supabase = await client();
    if (!supabase) return;
    // Solo verifican las actas firmadas por la maestra PROPIA (expectedMfp), y todas las
    // neuronas de la cuenta comparten owner_id. Filtrar por dueño elimina la superficie de
    // INUNDACIÓN entre cuentas (revisión adversarial Adenda 128): filas basura de otras
    // cuentas ya no pueden ocupar el tope y expulsar revocaciones legítimas. Orden por
    // recientes primero como refuerzo. Sin sesión (sin owner) se lee sin filtro y se
    // seguirá descartando todo lo que no verifique contra el ancla.
    const owner = await ownerId(supabase);
    let query = supabase
      .from("os_mesh_relay")
      .select("payload")
      .eq("kind", "device-cert-revocation")
      .order("created_at", { ascending: false })
      .limit(CRL_READ_LIMIT);
    if (owner) query = query.eq("owner_id", owner);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return; // fallo transitorio: NO vacía el set
    const next = new Set<string>(revokedCertIds); // conserva las ya conocidas (p. ej. la recién publicada)
    for (const row of data as Array<Record<string, unknown>>) {
      const acta = (row.payload ?? null) as DeviceCertRevocation | null;
      if (!acta || !acta.certId) continue;
      if (!(await verifyDeviceCertRevocation(acta, expectedMfp))) continue; // acta inválida / ancla ajena: se ignora
      next.add(acta.certId);
    }
    revokedCertIds = next;
  } catch {
    /* */
  }
}

/** El conjunto ACTUAL de `certId` revocados (verificados). */
export function deviceCertRevokedIds(): Set<string> {
  return revokedCertIds;
}

/**
 * Devuelve un predicado SÍNCRONO sobre el set ACTUAL (para pasar a
 * `verifyDeviceCert(..., { isCertRevoked })`). Lee la variable de módulo en cada
 * llamada, así que ve siempre el set reconstruido por el último refresco.
 */
export function makeIsCertRevoked(): (certId: string) => boolean {
  return (certId: string) => revokedCertIds.has(certId);
}

/** Reinicia el estado en memoria (vacía el set). Solo para pruebas. */
export function _resetDeviceCertRevocations(): void {
  revokedCertIds = new Set<string>();
}
