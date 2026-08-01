"use client";

/**
 * StarSeed OS — RED SINÁPTICA · TRANSPORTE POR SERVIDOR (Adenda 99).
 * ============================================================================
 * Cuando el enrutador sináptico decide una vía de SERVIDOR (no malla directa),
 * la carga aterriza en `os_mesh_relay`:
 *
 *   · PÚBLICO  → `uploadPublic`: el servidor almacena y CUALQUIER neurona
 *     autenticada lo alcanza (feed público). Texto plano (es público).
 *   · RELÉ     → `uploadRelay`: privado + lejano; la nube hace de PUENTE
 *     CIFRADO (payload AES-GCM en cliente, el servidor no lee). RLS por cuenta.
 *   · FARO     → `emitBeacon` / `pullBeacons`: descubrimiento — una neurona
 *     anuncia que está en línea; las demás dibujan el RADAR de conexiones
 *     cercanas. Sin PII; posición solo con opt-in.
 *
 * Sigue el patrón de federation.ts (cliente Supabase, owner por sesión).
 * Degradación TOTAL y silenciosa: sin sesión/tabla/red no hace nada y la malla
 * local sigue igual. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { getMeshPrivacy } from "./privacy";
import { getConnectivitySettings } from "./connectivity";
import { getMeshServer } from "./servers";
import {
  wrapSigned,
  unwrapSigned,
  signIdentityClaim,
  verifyEpub,
  verifyContent,
  fpOf,
  signRevocation,
  verifyRevocation,
  regenerateIdentity,
  myFingerprint,
  getRevocationCert,
} from "./mesh-identity";
import { deviceId } from "./federation";
import { tick as lamportTick, observe as lamportObserve } from "./logical-clock";
import { acceptFreshness } from "./replay-guard";
import { encryptEnvelope, decryptEnvelope, type EncEnvelope } from "./relay-crypto";
// Cifrado POR-DESTINATARIO (v:3): E2E dirigido. Solo el destinatario abre el relé,
// ni siquiera otra neurona de la cuenta con el llavero compartido (Adenda 124 · #mesh4).
import { myEncryptionPublicKey, encryptEnvelopeFor, type RecipientEnvelope } from "./recipient-crypto";
// Cert de dispositivo firmado por la clave MAESTRA de la cuenta (Adenda 126): re-habilita
// con seguridad el direccionamiento v:3 POR-DISPOSITIVO cerrando el CRÍTICO de la Adenda 125
// (device_id sin firmar). Ata {identidad soberana ↔ cuenta ↔ device_id de relé} bajo un ancla
// TOFU account→mfp, de modo que una neurona ya no puede reclamar el device_id de otra.
import { signDeviceCert, verifyDeviceCert, type DeviceCert } from "./master-identity";
// CRL de certificados de dispositivo (Adenda 128): revoca una EMISIÓN concreta de cert
// sin retirar la identidad soberana, complementando la caducidad por `iat` (Adenda 127).
import { makeIsCertRevoked } from "./device-revocation";
import { getActiveModemPreset } from "./sync";
import { getMeshState } from "./store";
import type { MeshPayloadType, TrafficClass } from "./types";

/** Ventana de frescura de un faro (más viejo = neurona apagada). */
const BEACON_FRESH_MS = 4 * 60_000;
/** Caducidad que se graba en la fila (limpieza). */
const RELAY_TTL_MS = 24 * 60 * 60_000;
const BEACON_TTL_MS = 5 * 60_000;
/** Feed público: página y tope de páginas por sondeo (drenado sin huecos, Adenda 119). */
const FEED_PAGE = 100;
const FEED_MAX_PAGES = 12;
/**
 * Registro de IDENTIDADES: tope de páginas del DRENADO (seguimiento adversarial Adenda 126).
 * Reusa el tamaño de página del feed (FEED_PAGE); IDENTITY_MAX_PAGES × FEED_PAGE ≈ 5000 filas
 * acotan el trabajo por sondeo. El `limit(500)` fijo anterior dejaba las identidades > 500 sin
 * resolver y permitía a un inundador Sybil EXPULSAR del tope la fila de una víctima (debilitando
 * el TOFU device_id). Ver `refreshIdentities`.
 */
const IDENTITY_MAX_PAGES = 50;

/**
 * Token-bucket local ANTI-FLOOD (Adenda 119): frena ráfagas patológicas de subidas
 * desde esta neurona (protege el servidor compartido y complementa el 429 del
 * servidor). Generoso a propósito: no estorba el uso normal, solo corta bucles.
 */
const CLIENT_RATE_MAX = 30;
const CLIENT_RATE_WINDOW_MS = 5_000;
let rateTokens = CLIENT_RATE_MAX;
let rateLastRefill = Date.now();
function clientRateAllow(): boolean {
  const now = Date.now();
  rateTokens = Math.min(CLIENT_RATE_MAX, rateTokens + ((now - rateLastRefill) / CLIENT_RATE_WINDOW_MS) * CLIENT_RATE_MAX);
  rateLastRefill = now;
  if (rateTokens < 1) return false;
  rateTokens -= 1;
  return true;
}

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

/** ¿Hay sesión de cuenta ahora? (el enrutador lo usa para `hasAccount`). */
export async function hasAccountSession(): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;
  return (await ownerId(supabase)) !== null;
}

export interface ServerEnvelope {
  cls: TrafficClass;
  ptype: MeshPayloadType;
  /** Cuerpo de la transmisión (se cifra en 'relay'). */
  body: unknown;
  /** Destinatario lógico (relay dirigido); null/undefined = a la cuenta. */
  recipient?: string;
  /** Id de origen estable (dedupe). */
  oid?: string;
  /** Reloj lógico de Lamport (orden causal entre pares · Adenda 115). */
  lc?: number;
}

export interface ServerSendResult {
  ok: boolean;
  /** Referencia legible para el recibo (id de fila del servidor). */
  ref?: string;
  detail: string;
}

/**
 * Endpoint de un servidor PROPIO (custom) si el id no es "starseed". Vacío/null
 * = usar el servidor StarSeed (Supabase del OS). Adenda 101.
 */
function customEndpoint(serverId?: string): string | null {
  if (!serverId || serverId === "starseed") return null;
  try {
    const srv = getMeshServer(serverId);
    const ep = srv?.endpoint?.trim();
    return ep ? ep.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

/** Token bearer configurado para un servidor propio (Adenda 107). */
function tokenFor(serverId?: string): string | undefined {
  if (!serverId || serverId === "starseed") return undefined;
  try {
    return getMeshServer(serverId)?.token || undefined;
  } catch {
    return undefined;
  }
}
/** Token del servidor propio ACTIVO de la cuenta. */
function activeAccountToken(): string | undefined {
  try {
    return tokenFor(getConnectivitySettings().serverId);
  } catch {
    return undefined;
  }
}
function authHeaders(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Desenvuelve un sobre firmado y aplica la GUARDA ANTI-REPLAY (Adenda 119): si un
 * contenido v:2 está fuera de ventana temporal o su nonce ya se vio (reinyección),
 * se degrada a NO verificado aunque la firma sea válida. Los sobres v:1/planos no
 * cambian (la guarda no aplica). El duplicado exacto ya se deduplica por id.
 */
async function unwrapFresh(payload: unknown, id: string): Promise<{ body: unknown; verified: boolean; fp?: string }> {
  const u = await unwrapSigned(payload);
  // Solo se consulta/registra la guarda para firmas VÁLIDAS: así un atacante no
  // puede envenenar el LRU de nonces con sobres de firma inválida (ni gastar su
  // memoria), y el `fp` que ancla el nonce es el de una firma comprobada.
  if (!u.verified) return { body: u.body, verified: false, fp: u.fp };
  // `id` (id de fila / oid) ata el nonce al ítem: una re-entrega del MISMO id es
  // legítima (realtime + sondeo, o recarga que re-baja el feed); un id distinto con el
  // mismo nonce es reinyección. Así no se degrada contenido legítimo re-entregado.
  return { body: u.body, verified: acceptFreshness(u.fp, u.ts, u.nonce, id), fp: u.fp };
}

/**
 * POST genérico a un servidor propio (público o privado añadido por la cuenta/
 * grupo). Best-effort: si el endpoint no responde o CORS lo bloquea, se informa
 * y la entrega hará failover. El protocolo es un JSON simple {channel, envelope}.
 */
async function postToEndpoint(endpoint: string, channel: "public" | "relay", env: ServerEnvelope, token?: string): Promise<ServerSendResult> {
  try {
    // Estampa el reloj lógico de Lamport para orden causal entre pares (Adenda 115).
    const stamped: ServerEnvelope = { ...env, lc: lamportTick() };
    const res = await fetch(`${endpoint}/mesh/${channel}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ channel, device_id: deviceId(), envelope: stamped }),
    });
    if (!res.ok) return { ok: false, detail: `servidor propio rechazó (${res.status})` };
    return { ok: true, detail: `enviado a tu servidor (${channel})` };
  } catch {
    return { ok: false, detail: "servidor propio inalcanzable (endpoint/CORS)" };
  }
}

/** Sube CONTENIDO PÚBLICO (texto plano, FIRMADO). Cualquiera de la red lo alcanza. */
export async function uploadPublic(env: ServerEnvelope, serverId?: string): Promise<ServerSendResult> {
  if (!clientRateAllow()) return { ok: false, detail: "límite de tasa local (anti-flood)" };
  // Firma el contenido público (autenticidad + integridad); el receptor verifica.
  const signed = await wrapSigned(env.body);
  const ep = customEndpoint(serverId);
  if (ep) return postToEndpoint(ep, "public", { ...env, body: signed }, tokenFor(serverId));
  try {
    const supabase = await client();
    if (!supabase) return { ok: false, detail: "sin cliente de servidor" };
    const owner = await ownerId(supabase);
    if (!owner) return { ok: false, detail: "sin cuenta activa: se encola" };
    const { data, error } = await supabase
      .from("os_mesh_relay")
      .insert({
        owner_id: owner,
        channel: "public",
        kind: "data",
        cls: env.cls,
        ptype: env.ptype,
        enc: false,
        payload: signed,
        oid: env.oid ?? null,
        device_id: deviceId(),
        expires_at: null, // lo público no caduca por defecto
      })
      .select("id")
      .single();
    if (error) return { ok: false, detail: `servidor rechazó: ${error.message}` };
    const ref = data?.id ? String(data.id).slice(0, 8) : undefined;
    return { ok: true, ref, detail: `subido al servidor público${ref ? ` · fila ${ref}` : ""}` };
  } catch {
    return { ok: false, detail: "error de red al subir al servidor público" };
  }
}

/**
 * Cifra el cuerpo de un relé eligiendo el esquema (Adenda 124 · #mesh4):
 *   · Si conocemos la clave de CIFRADO del destinatario (encryptionKeyFor resuelve su
 *     epub publicada y verificada) → sobre v:3 POR-DESTINATARIO (ECDH→HKDF→AES-GCM):
 *     SOLO ese destinatario lo abre, ni siquiera otra neurona de la misma cuenta que
 *     comparte el llavero. Es OPT-IN por resolución (necesita `recipient` + su epub).
 *   · Si no hay destinatario, no se resuelve su epub, o el cifrado v:3 falla → llavero
 *     COMPARTIDO v:1/2 (encryptEnvelope), retrocompatible y con FALLBACK automático.
 *
 * SEGUIMIENTOS (explícitamente FUERA de este cambio): (i) fan-out MULTI-destinatario
 * (cifrar un mismo relé a VARIAS neuronas / grupo / cuenta con varios sobres v:3), y
 * (ii) visibilidad RLS ENTRE CUENTAS del relé (hoy las filas solo las lee el emisor:
 * owner_id = auth.uid(), así que el destinatario de OTRA cuenta aún no las ve).
 */
async function encryptRelayBody(env: ServerEnvelope): Promise<EncEnvelope | RecipientEnvelope | null> {
  const payload = { cls: env.cls, ptype: env.ptype, body: env.body };
  const rcpt = env.recipient;
  if (rcpt) {
    const pub = encryptionKeyFor(rcpt);
    if (pub) {
      const per = await encryptEnvelopeFor(pub, payload);
      if (per) return per; // v:3 dirigido (E2E por-destinatario)
      // Si el cifrado por-destinatario falla, NO abortamos: caemos al compartido.
    }
  }
  return encryptEnvelope(payload); // v:1/2 llavero compartido (retrocompatible)
}

/** Sube un RELÉ PRIVADO cifrado. La nube solo transporta el texto cifrado. */
export async function uploadRelay(env: ServerEnvelope, serverId?: string): Promise<ServerSendResult> {
  if (!clientRateAllow()) return { ok: false, detail: "límite de tasa local (anti-flood)" };
  const ep = customEndpoint(serverId);
  if (ep) {
    // Servidor propio: ciframos igualmente antes de salir (E2E; el servidor
    // propio tampoco lee el contenido privado).
    const enc = await encryptRelayBody(env);
    if (!enc) return { ok: false, detail: "sin cifrado disponible: no se sube dato privado en claro" };
    return postToEndpoint(ep, "relay", { ...env, body: enc as unknown }, tokenFor(serverId));
  }
  try {
    const supabase = await client();
    if (!supabase) return { ok: false, detail: "sin cliente de servidor" };
    const owner = await ownerId(supabase);
    if (!owner) return { ok: false, detail: "sin cuenta activa: se encola" };
    const enc = await encryptRelayBody(env);
    if (!enc) {
      return { ok: false, detail: "sin cifrado disponible: no se sube dato privado en claro" };
    }
    const { data, error } = await supabase
      .from("os_mesh_relay")
      .insert({
        owner_id: owner,
        channel: "relay",
        kind: "data",
        recipient: env.recipient ?? null,
        cls: env.cls,
        ptype: env.ptype,
        enc: true,
        payload: enc as unknown as Record<string, unknown>,
        oid: env.oid ?? null,
        device_id: deviceId(),
        expires_at: new Date(Date.now() + RELAY_TTL_MS).toISOString(),
      })
      .select("id")
      .single();
    if (error) return { ok: false, detail: `servidor rechazó el relé: ${error.message}` };
    const ref = data?.id ? String(data.id).slice(0, 8) : undefined;
    return { ok: true, ref, detail: `relé cifrado subido${ref ? ` · fila ${ref}` : ""}` };
  } catch {
    return { ok: false, detail: "error de red al subir el relé cifrado" };
  }
}

/* ── FAN-OUT MULTI-DESTINATARIO del relé (Adenda 127 · seguimiento del #mesh4) ────────
 * Seguimiento explícito anunciado en la cabecera de `uploadRelay`. Diseño ADITIVO y de
 * BAJO RIESGO: NO cambia el formato del sobre v:3 ni el lado receptor; sube UNA fila POR
 * destinatario, cada una con su PROPIO sobre (v:3 E2E si conocemos su epub; si no, fallback
 * automático al llavero compartido v:1/2, igual que `uploadRelay`). Así una fila de fan-out
 * es INDISTINGUIBLE de una de `uploadRelay` dirigida a ese destinatario: el receptor la
 * descifra sin cambios (`decryptEnvelope` ya rutea v:3 → `decryptEnvelopeFor`).
 * ---------------------------------------------------------------------------------------- */

/**
 * Resumen de un FAN-OUT multi-destinatario: N sobres/filas, uno por destinatario.
 */
export interface RelayMultiResult {
  /** Filas subidas con éxito (una por destinatario alcanzado). */
  sent: number;
  /** Destinatarios omitidos: sin cifrado disponible o rechazo del servidor. */
  failed: number;
}

/**
 * Sube un relé a VARIOS destinatarios: para CADA uno construye su PROPIO sobre reutilizando
 * la MISMA lógica por-destinatario de `encryptRelayBody` (v:3 si hay epub; si no, llavero
 * compartido) e inserta UNA fila con `recipient: <ese destinatario>` y COLUMNAS IDÉNTICAS a
 * `uploadRelay`. Un destinatario sin cifrado se OMITE (nunca se sube dato privado en claro),
 * sin degradar al resto. Devuelve {sent, failed}. `uploadRelay` de un solo destinatario queda
 * intacto. Nunca lanza.
 */
export async function uploadRelayMulti(env: ServerEnvelope, recipients: string[], serverId?: string): Promise<RelayMultiResult> {
  const summary: RelayMultiResult = { sent: 0, failed: 0 };
  if (!Array.isArray(recipients) || recipients.length === 0) return summary;
  // Dedup: una sola fila por destinatario (un grupo puede traer duplicados).
  const targets = Array.from(new Set(recipients.filter((r) => !!r)));
  if (targets.length === 0) return summary;
  // Un solo token por operación de fan-out (como una subida lógica), consistente con
  // `uploadRelay`: el bucket anti-flood corta bucles patológicos, no envíos legítimos a un grupo.
  if (!clientRateAllow()) {
    summary.failed = targets.length;
    return summary;
  }
  const ep = customEndpoint(serverId);
  if (ep) {
    // Servidor propio: un POST cifrado por destinatario (E2E; el servidor propio tampoco lee).
    const token = tokenFor(serverId);
    for (const rcpt of targets) {
      const perEnv: ServerEnvelope = { ...env, recipient: rcpt };
      const enc = await encryptRelayBody(perEnv);
      if (!enc) {
        summary.failed++; // sin cifrado: no se sube dato privado en claro
        continue;
      }
      const res = await postToEndpoint(ep, "relay", { ...perEnv, body: enc as unknown }, token);
      if (res.ok) summary.sent++;
      else summary.failed++;
    }
    return summary;
  }
  try {
    const supabase = await client();
    if (!supabase) {
      summary.failed = targets.length;
      return summary;
    }
    const owner = await ownerId(supabase);
    if (!owner) {
      summary.failed = targets.length;
      return summary;
    }
    const me = deviceId();
    const expiresAt = new Date(Date.now() + RELAY_TTL_MS).toISOString();
    for (const rcpt of targets) {
      // Sobre PROPIO por destinatario: misma lógica por-destinatario que `uploadRelay`
      // (v:3 si hay epub; si no, llavero compartido v:1/2). Columnas de fila IDÉNTICAS.
      const perEnv: ServerEnvelope = { ...env, recipient: rcpt };
      const enc = await encryptRelayBody(perEnv);
      if (!enc) {
        summary.failed++; // sin cifrado: no se sube dato privado en claro
        continue;
      }
      const { error } = await supabase
        .from("os_mesh_relay")
        .insert({
          owner_id: owner,
          channel: "relay",
          kind: "data",
          recipient: rcpt,
          cls: env.cls,
          ptype: env.ptype,
          enc: true,
          payload: enc as unknown as Record<string, unknown>,
          oid: env.oid ?? null,
          device_id: me,
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (error) summary.failed++;
      else summary.sent++;
    }
    return summary;
  } catch {
    return summary;
  }
}

/**
 * FAN-OUT a un GRUPO: resuelve los destinatarios (owner ids) de `os_memberships`
 * (`groupRecipients`) y delega en `uploadRelayMulti`. Best-effort: grupo vacío o sin
 * sesión → {sent:0, failed:0}. Nunca lanza.
 */
export async function uploadRelayGroup(env: ServerEnvelope, groupSlug: string, serverId?: string): Promise<RelayMultiResult> {
  const recipients = await groupRecipients(groupSlug);
  return uploadRelayMulti(env, recipients, serverId);
}

/** Una neurona vecina descubierta por su faro (para el radar). */
export interface RelayBeacon {
  deviceId: string;
  label: string | null;
  region: string | null;
  preset: string | null;
  onlineCount: number;
  /** epoch ms de la última señal. */
  at: number;
  /** ¿Es de mi propia cuenta? (federación) o ajena (red pública). */
  own: boolean;
  /** Esta neurona ofrece internet público del OS con sus recursos (Adenda 115). */
  offersPublic?: boolean;
  /** Puerto anunciado para vínculos privados personalizables. */
  port?: number;
}

/** Oferta de servicio público de ESTA neurona (para anunciarla en el faro). */
function myPublicOffer(): { offersPublic: boolean; port?: number } {
  try {
    // Lectura directa de las claves de neuronas (sin acoplar el mesh a esa capa).
    // Los ajustes se indexan por el id de neurona (`starseed.neuron.device-id`),
    // distinto del deviceId del mesh.
    const raw = safeGet("starseed.neurons.prefs.v1");
    const neuronId = safeGet("starseed.neuron.device-id") || "";
    if (!raw || !neuronId) return { offersPublic: false };
    const prefs = JSON.parse(raw) as { settings?: Record<string, { offerPublicInternet?: boolean; publicPort?: number }> };
    const s = prefs?.settings?.[neuronId];
    if (s?.offerPublicInternet) return { offersPublic: true, port: typeof s.publicPort === "number" ? s.publicPort : undefined };
    return { offersPublic: false };
  } catch {
    return { offersPublic: false };
  }
}

/**
 * Emite (refresca) el FARO de esta neurona: anuncia que está en línea con sus
 * datos de antena mínimos. Respeta la privacidad (visibility='private' no
 * emite faro; nombre solo con shareName). delete+insert = un faro por neurona.
 */
export async function emitBeacon(): Promise<boolean> {
  try {
    const privacy = getMeshPrivacy();
    if (privacy.visibility === "private") return false; // invisible: sin faro
    // Internet público apagado (SESIÓN PRIVADA) → no anunciarse al radar público.
    // Radar público en "off" → participa en la malla, pero invisible entre cuentas.
    const conn = getConnectivitySettings();
    if (!conn.publicInternet) return false;
    if (privacy.publicRadar === "off") return false;
    // En "anonymous" damos y recibimos, pero SIN exponer usuario ni ubicación.
    const anonymous = privacy.publicRadar === "anonymous";
    const supabase = await client();
    if (!supabase) return false;
    const owner = await ownerId(supabase);
    if (!owner) return false;
    const s = getMeshState();
    const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online").length;
    const me = deviceId();
    // Limpieza best-effort: retira MIS filas caducadas (relés/faros viejos) —
    // así `expires_at` se hace cumplir de verdad y la tabla no crece sin límite.
    await supabase.from("os_mesh_relay").delete().eq("owner_id", owner).lt("expires_at", new Date().toISOString());
    // Un solo faro por neurona: retira el anterior y pon uno fresco.
    await supabase.from("os_mesh_relay").delete().eq("owner_id", owner).eq("device_id", me).eq("kind", "beacon");
    const { error } = await supabase.from("os_mesh_relay").insert({
      owner_id: owner,
      channel: "public",
      kind: "beacon",
      cls: "P1",
      ptype: "presence",
      enc: false,
      payload: myPublicOffer(), // anuncia si ofrece internet público + puerto (Adenda 115)
      device_id: me,
      // Anónimo → sin etiqueta de usuario. Visible → según shareName.
      label: anonymous ? null : privacy.shareName ? s.self?.shortName || s.self?.longName || "Neurona" : null,
      region: s.region,
      preset: getActiveModemPreset(),
      online_count: online,
      expires_at: new Date(Date.now() + BEACON_TTL_MS).toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

/** Retira el faro de esta neurona (al apagar o pasar a invisible). */
export async function purgeBeacon(): Promise<void> {
  try {
    const supabase = await client();
    if (!supabase) return;
    const owner = await ownerId(supabase);
    if (!owner) return;
    await supabase
      .from("os_mesh_relay")
      .delete()
      .eq("owner_id", owner)
      .eq("device_id", deviceId())
      .eq("kind", "beacon");
  } catch {
    /* */
  }
}

/**
 * Lee los FAROS recientes de la red → neuronas online cercanas (radar). Incluye
 * las de otras cuentas (feed público) y marca cuáles son de la propia cuenta.
 */
export async function pullBeacons(): Promise<RelayBeacon[]> {
  try {
    const supabase = await client();
    if (!supabase) return [];
    const owner = await ownerId(supabase);
    const me = deviceId();
    const cutoff = new Date(Date.now() - BEACON_FRESH_MS).toISOString();

    // Marcar "own" (neuronas de MI cuenta) SIN exponer el owner_id de terceros:
    // el feed público NO selecciona owner_id (era una fuga del UUID de cuenta
    // soberana a cualquiera). En su lugar, consulto los device_id de MI cuenta
    // aparte (RLS me deja) y comparo localmente.
    const myDevices = new Set<string>();
    if (owner) {
      const { data: mine } = await supabase
        .from("os_mesh_relay")
        .select("device_id")
        .eq("owner_id", owner)
        .eq("kind", "beacon");
      if (Array.isArray(mine)) {
        for (const r of mine as Array<Record<string, unknown>>) {
          if (r.device_id) myDevices.add(String(r.device_id));
        }
      }
    }

    const { data, error } = await supabase
      .from("os_mesh_relay")
      .select("device_id, label, region, preset, online_count, payload, created_at")
      .eq("kind", "beacon")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(48);
    if (error || !Array.isArray(data)) return [];
    const out: RelayBeacon[] = [];
    const seen = new Set<string>();
    for (const row of data as Array<Record<string, unknown>>) {
      const dev = String(row.device_id ?? "");
      if (!dev || dev === me || seen.has(dev)) continue; // ni yo ni duplicados
      seen.add(dev);
      const offer = (row.payload ?? null) as { offersPublic?: boolean; port?: number } | null;
      out.push({
        deviceId: dev,
        label: row.label ? String(row.label) : null,
        region: row.region ? String(row.region) : null,
        preset: row.preset ? String(row.preset) : null,
        onlineCount: typeof row.online_count === "number" ? row.online_count : 0,
        at: row.created_at ? Date.parse(String(row.created_at)) : 0,
        own: myDevices.has(dev),
        offersPublic: offer?.offersPublic === true,
        port: typeof offer?.port === "number" ? offer.port : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Un mensaje de relé descifrado listo para entregar a las dimensiones. */
export interface RelayInboundItem {
  id: string;
  cls: TrafficClass;
  ptype: MeshPayloadType;
  body: unknown;
  from: string | null;
  at: number;
  /** true si venía cifrado y NO se pudo descifrar (falta la clave de cuenta). */
  locked: boolean;
  /** true si el contenido público iba FIRMADO y la firma verificó (Adenda 106). */
  verified?: boolean;
  /** Fingerprint de la identidad firmante (Adenda 107). */
  signerFp?: string;
}

/* ── Registro de IDENTIDAD ↔ CUENTA (Adenda 107) ───────────────────────────── */

let identityRegistered = false;
let idMap = new Map<string, string>(); // fp → owner uuid (verificado)
let revokedSet = new Set<string>(); // fingerprints revocados (verificados) — Adenda 108
// Mapa de CIFRADO por-destinatario (Adenda 124/126): clave (fp | owner | device_id) →
// {pub ECDH, fp de la identidad que la avala}. Los ejes `fp` y `owner` se llenan SOLO con
// epub cuya firma (esig) verifica contra la identidad soberana. El eje `device_id`
// (re-habilitado en la Adenda 126 tras el CRÍTICO de la 125) exige ADEMÁS un cert de
// dispositivo firmado por la clave MAESTRA bajo el ancla TOFU account→mfp (ver
// refreshIdentities). Para una cuenta con VARIAS neuronas, la entrada por `owner` es la de
// la ÚLTIMA vista (limitación de un-destinatario; el fan-out multi-destinatario es un
// SEGUIMIENTO — ver cabecera de uploadRelay).
let encMap = new Map<string, { pub: JsonWebKey; fp: string }>();

/**
 * Anclas TOFU del direccionamiento v:3 por-dispositivo (Adenda 126), persistidas y locales
 * por neurona (como todo TOFU). Se fijan en la PRIMERA visión válida y luego deben COINCIDIR:
 *
 *   · `account → mfp` (ACCOUNT_MFP_LS): la huella de la clave MAESTRA de cada cuenta. Es el
 *     ancla que `verifyDeviceCert` exige. Seguridad: el RLS de inserción fija
 *     `owner_id = auth.uid()`, así que SOLO el dueño de una cuenta publica filas con su
 *     owner_id → solo él fija el mfp de SU cuenta; un tercero no puede pre-fijar el de una víctima.
 *   · `device_id → owner` (DEVICE_OWNER_LS): ENDURECIMIENTO aditivo sobre las 5 comprobaciones
 *     del cert. El `device_id` es un string GLOBAL que ninguna de esas comprobaciones hace
 *     único: cada una liga el cert a SU PROPIA cuenta, pero dos cuentas distintas podrían
 *     firmar (con SUS respectivas maestras) un cert que reclama el MISMO device_id y pelear
 *     por la ranura `encMap[device_id]` (última escritura gana) — la MISMA clase del CRÍTICO
 *     de la Adenda 125, solo que ahora exige una maestra propia. Este ancla fija el device_id
 *     a la PRIMERA cuenta que lo reclama válidamente; otra cuenta que lo reclame después NO lo
 *     keyea (cae al llavero compartido, fail-safe). Cierra la substitución cruzada de cuenta.
 */
const ACCOUNT_MFP_LS = "starseed.mesh.account-mfp.v1"; // { [ownerUuid]: mfp }
const DEVICE_OWNER_LS = "starseed.mesh.device-owner.v1"; // { [relayDeviceId]: ownerUuid }

/** Carga un mapa de pines string→string persistido (vacío si no hay o corrupto). Nunca lanza. */
function loadPinMap(lsKey: string): Map<string, string> {
  const pins = new Map<string, string>();
  try {
    const raw = safeGet(lsKey);
    if (!raw) return pins;
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string" && v) pins.set(k, v);
    }
  } catch {
    /* pin corrupto: se re-fija por TOFU en la próxima visión válida */
  }
  return pins;
}

/** Persiste un mapa de pines string→string (best-effort; safe-storage nunca lanza). */
function savePinMap(lsKey: string, pins: Map<string, string>): void {
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of pins) obj[k] = v;
    safeSet(lsKey, JSON.stringify(obj));
  } catch {
    /* si no persiste, se vuelve a fijar la próxima vez */
  }
}

/**
 * Publica UNA reclamación FIRMADA de identidad: "la cuenta <owner> controla la
 * clave cuyo fingerprint es <fp>", firmando el uuid de la cuenta con la clave de
 * identidad. Cualquier neurona la verifica y liga fp→cuenta. Una por neurona.
 */
export async function registerIdentity(): Promise<void> {
  try {
    if (identityRegistered) return;
    const supabase = await client();
    if (!supabase) return;
    const owner = await ownerId(supabase);
    if (!owner) return;
    // Reclamación FIRMADA que liga la cuenta a esta identidad y, ADEMÁS, publica la
    // clave pública de CIFRADO ECDH (epub) avalada por la misma clave soberana
    // (esig sobre {owner,epub}). Así otras neuronas pueden cifrarnos relés v:3 que
    // SOLO nosotros abrimos. Si no hay epub (sin WebCrypto), la reclamación va sin
    // ella y el relé cae al llavero compartido (retrocompatible).
    const epub = await myEncryptionPublicKey();
    const claim = await signIdentityClaim(owner, epub);
    if (!claim) return;
    identityRegistered = true;
    const me = deviceId();
    // CERT DE DISPOSITIVO firmado por la clave MAESTRA (Adenda 126): ata la identidad
    // soberana (claim.fp) ↔ la cuenta (owner) ↔ el device_id de RELÉ (me). Publicarlo
    // permite a los receptores CONFIAR en el direccionamiento v:3 POR-DISPOSITIVO
    // (encMap[device_id]) sin la substitución de clave que cerró el CRÍTICO de la
    // Adenda 125 (el device_id era una columna sin firmar). Best-effort: sin maestra o
    // sin WebCrypto el cert es null y el relé por-dispositivo cae al llavero compartido
    // (retrocompatible, fail-safe). No bloquea el registro de identidad.
    const devcert = await signDeviceCert(claim.fp, owner, me);
    await supabase.from("os_mesh_relay").delete().eq("owner_id", owner).eq("device_id", me).eq("kind", "identity");
    const { error: idErr } = await supabase.from("os_mesh_relay").insert({
      owner_id: owner,
      channel: "public",
      kind: "identity",
      cls: "P3",
      ptype: "manifest",
      enc: false,
      payload: {
        owner: claim.owner,
        fp: claim.fp,
        pub: claim.pub,
        sig: claim.sig,
        ...(claim.epub && claim.esig ? { epub: claim.epub, esig: claim.esig } : {}),
        ...(devcert ? { devcert } : {}),
      },
      device_id: me,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
    });
    if (idErr) {
      // Observabilidad (Adenda 123): antes el registro fallaba EN SILENCIO si la BD
      // rechazaba `kind='identity'` (CHECK sin ampliar). Avisar y permitir reintento.
      identityRegistered = false;
      if (typeof console !== "undefined") {
        console.warn("[mesh] registro de identidad rechazado por el servidor (¿migración de `kind` sin aplicar?):", idErr.message);
      }
    }
    // Sube el certificado de revocación PRE-GENERADO de este dispositivo a la
    // cuenta (Adenda 115): permite revocarlo desde otra neurona si se pierde.
    try {
      const cert = await getRevocationCert();
      if (cert) {
        await supabase.from("os_mesh_relay").delete().eq("owner_id", owner).eq("device_id", me).eq("kind", "revocation-cert");
        await supabase.from("os_mesh_relay").insert({
          owner_id: owner,
          channel: "relay", // solo la cuenta lo lee (RLS por owner); no es público
          kind: "revocation-cert",
          cls: "P3",
          ptype: "manifest",
          enc: false,
          payload: { fp: cert.fp, pub: cert.pub, sig: cert.sig },
          device_id: me,
          recipient: owner,
          expires_at: null,
        });
      }
    } catch {
      /* el registro de identidad ya quedó; el cert es best-effort */
    }
  } catch {
    identityRegistered = false;
  }
}

/* ── REVOCACIÓN POR AUTORIDAD DE CUENTA (Adenda 115) ────────────────────────────
 * Con el certificado de revocación pre-generado guardado en la cuenta, cualquier
 * neurona de la MISMA cuenta puede revocar un dispositivo perdido SIN su clave
 * viva: publica su certificado (auto-autenticable) como acta de revocación.
 * ---------------------------------------------------------------------------- */

export interface AccountRevocationCert {
  fp: string;
  deviceId: string;
  at: number;
}

/** Lista los certificados de revocación de las neuronas de la cuenta (verificados). */
export async function listRevocationCerts(): Promise<AccountRevocationCert[]> {
  try {
    const supabase = await client();
    if (!supabase) return [];
    const owner = await ownerId(supabase);
    if (!owner) return [];
    const { data } = await supabase
      .from("os_mesh_relay")
      .select("payload, device_id, created_at")
      .eq("owner_id", owner)
      .eq("kind", "revocation-cert")
      .limit(200);
    if (!Array.isArray(data)) return [];
    const out: AccountRevocationCert[] = [];
    const me = deviceId();
    for (const row of data as Array<Record<string, unknown>>) {
      const p = (row.payload ?? null) as { fp?: string; pub?: JsonWebKey; sig?: string } | null;
      if (!p?.fp || !p.pub || !p.sig) continue;
      if (!(await verifyRevocation(p.fp, p.sig, p.pub))) continue; // cert inválido
      const dev = String(row.device_id ?? "");
      if (dev === me) continue; // no ofrecer revocar ESTE dispositivo aquí (usa auto-revocación)
      out.push({ fp: p.fp, deviceId: dev, at: row.created_at ? Date.parse(String(row.created_at)) : 0 });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Revoca una neurona de la cuenta por su certificado pre-generado (autoridad de
 * cuenta): publica el acta de revocación aunque el dispositivo esté perdido.
 */
export async function revokeDeviceByCert(fp: string): Promise<{ ok: boolean }> {
  try {
    const supabase = await client();
    if (!supabase) return { ok: false };
    const owner = await ownerId(supabase);
    if (!owner) return { ok: false };
    const { data } = await supabase
      .from("os_mesh_relay")
      .select("payload")
      .eq("owner_id", owner)
      .eq("kind", "revocation-cert")
      .limit(200);
    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    const foundRow = rows.find((r) => {
      const p = r.payload as { fp?: string } | null;
      return p?.fp === fp;
    });
    const found = (foundRow?.payload ?? null) as { fp?: string; pub?: JsonWebKey; sig?: string } | null;
    if (!found?.fp || !found.pub || !found.sig) return { ok: false };
    if (!(await verifyRevocation(found.fp, found.sig, found.pub))) return { ok: false };
    await supabase.from("os_mesh_relay").insert({
      owner_id: owner,
      channel: "public",
      kind: "revocation",
      cls: "P3",
      ptype: "manifest",
      enc: false,
      payload: { fp: found.fp, pub: found.pub, sig: found.sig },
      device_id: deviceId(),
      expires_at: null,
    });
    // Refinamiento (Adenda 116): retira el REGISTRO DE IDENTIDAD del dispositivo
    // revocado (por fp) y su certificado, para que no siga ligando fp→cuenta.
    try {
      await supabase.from("os_mesh_relay").delete().eq("owner_id", owner).eq("kind", "identity").eq("payload->>fp", fp);
      const dev = String(foundRow?.device_id ?? "");
      if (dev) await supabase.from("os_mesh_relay").delete().eq("owner_id", owner).eq("kind", "revocation-cert").eq("device_id", dev);
    } catch {
      /* la revocación ya se publicó; la limpieza es best-effort */
    }
    revokedSet.add(fp);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Refresca el mapa VERIFICADO fp→cuenta desde el registro público. */
export async function refreshIdentities(): Promise<void> {
  try {
    const supabase = await client();
    if (!supabase) return;
    // DRENADO keyset de TODAS las filas de identidad (seguimiento de la revisión adversarial
    // Adenda 126): el `limit(500)` fijo (i) dejaba las identidades MÁS ALLÁ de 500 SIN resolver
    // para siempre y (ii) permitía a un inundador Sybil EXPULSAR del tope la fila de identidad de
    // una víctima —debilitando el TOFU device_id que ata el relé v:3—. Se drena por páginas
    // ASCENDENTES por (created_at, id) —misma forma que `pullPublicFeed`— con un tope duro
    // (~5000 filas = IDENTITY_MAX_PAGES × FEED_PAGE) que acota el trabajo por sondeo. Orden
    // ASCENDENTE por created_at: la fila de identidad LEGÍTIMA de un device_id es siempre la MÁS
    // ANTIGUA —un atacante solo puede publicar para ese device_id DESPUÉS de aprenderlo (faro/fila
    // de la víctima)—, así que procesarla primero hace que la víctima gane el pin TOFU de forma
    // determinista. Se recogen TODAS las filas y LUEGO corre la validación por-fila + pines TOFU +
    // detección de conflicto de dispositivo SIN CAMBIOS sobre el conjunto ordenado completo.
    // DRENADO por OFFSET estable (revisión adversarial Adenda 127): se pagina con `.range()`
    // ordenando por (created_at asc, id asc) — mismo patrón que los paginadores de
    // membership.ts / reach.ts. Se evita A PROPÓSITO el cursor keyset por created_at: un ÚNICO
    // insert masivo de ≥FEED_PAGE filas de identidad con el MISMO created_at (una transacción →
    // `now()` idéntico) atascaba el cursor keyset y dejaba SIN resolver toda identidad más nueva
    // (DoS PERMANENTE de la capa de identidad). El offset avanza pase lo que pase con los empates.
    const rows: Array<Record<string, unknown>> = [];
    let firstPageErrored = false;
    for (let page = 0; page < IDENTITY_MAX_PAGES; page++) {
      const from = page * FEED_PAGE;
      const { data, error } = await supabase
        .from("os_mesh_relay")
        .select("id, payload, owner_id, device_id, created_at")
        .eq("kind", "identity")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + FEED_PAGE - 1);
      // Defensivo: error/no-array de página → para y procesa lo ya drenado. Si falla la PRIMERA
      // página no se aprende nada nuevo → se PRESERVA el mapa vigente (como el `limit(500)`
      // original) en vez de vaciarlo por un fallo transitorio. Un fallo posterior procesa lo drenado.
      if (error || !Array.isArray(data)) {
        if (page === 0) firstPageErrored = true;
        break;
      }
      if (data.length === 0) break; // agotado
      for (const row of data as Array<Record<string, unknown>>) rows.push(row);
      if (data.length < FEED_PAGE) break; // última página: agotado
      if (page === IDENTITY_MAX_PAGES - 1) {
        console.warn(`[mesh] refreshIdentities: tope de ${IDENTITY_MAX_PAGES} páginas por sondeo; el resto se drena en el próximo ciclo.`);
      }
    }
    if (firstPageErrored) return; // primera lectura falló: no toques idMap/encMap (preserva lo conocido)
    // DETECCIÓN DE CONFLICTO EN LOTE (revisión adversarial Adenda 126): si DOS cuentas
    // distintas reclaman el MISMO device_id dentro de este lote, NINGUNA lo keyea — mata el
    // "cara o cruz" del primer avistamiento cuando ambas filas están presentes. El device_id
    // disputado cae al llavero compartido (fail-safe), jamás a la epub de un atacante.
    const devClaims = new Map<string, Set<string>>();
    for (const row of rows) {
      const pp = (row.payload ?? null) as { devcert?: DeviceCert } | null;
      const dev = String(row.device_id ?? "");
      if (pp?.devcert && dev) {
        let s = devClaims.get(dev);
        if (!s) { s = new Set<string>(); devClaims.set(dev, s); }
        s.add(String(row.owner_id));
      }
    }
    const contestedDevices = new Set<string>();
    for (const [dev, owners] of devClaims) if (owners.size > 1) contestedDevices.add(dev);
    const next = new Map<string, string>();
    const nextEnc = new Map<string, { pub: JsonWebKey; fp: string }>();
    // Anclas TOFU (Adenda 126): se cargan una vez, se consultan/fijan por fila y se
    // persisten al final SOLO si cambiaron (sin escrituras innecesarias en cada sondeo).
    const pins = loadPinMap(ACCOUNT_MFP_LS); // account→mfp (ancla del cert)
    const devicePins = loadPinMap(DEVICE_OWNER_LS); // device_id→owner (unicidad por cuenta)
    let pinsDirty = false;
    let devicePinsDirty = false;
    for (const row of rows) {
      const p = (row.payload ?? null) as {
        owner?: string; fp?: string; pub?: JsonWebKey; sig?: string; epub?: JsonWebKey; esig?: string; devcert?: DeviceCert;
      } | null;
      if (!p?.owner || !p.fp || !p.pub || !p.sig) continue;
      // BINDING SEGURO (Adenda 123): la cuenta RECLAMADA debe ser la del INSERTOR
      // real. El RLS de inserción fija `owner_id = auth.uid()`, así que exigir
      // owner === owner_id impide que una neurona publique una identidad "reclamando"
      // la cuenta de OTRA (firmaría el uuid ajeno con SU clave y, sin este cruce,
      // quedaría idMap[fpAtacante] = cuentaVíctima → suplantación de cuenta).
      if (String(p.owner) !== String(row.owner_id)) continue;
      if (!(await verifyContent(p.owner, p.sig, p.pub))) continue; // firma inválida
      if ((await fpOf(p.pub)) !== p.fp) continue; // fp no coincide con la clave
      next.set(p.fp, p.owner);
      // CLAVE DE CIFRADO (Adenda 124): solo se confía en `epub` si su firma `esig`
      // (sobre {owner,epub}) verifica contra la MISMA identidad soberana ya validada
      // arriba. Un tercero no puede inyectar una epub falsa sin la clave privada.
      if (p.epub && p.esig && (await verifyEpub(p.owner, p.epub, p.esig, p.pub))) {
        const entry = { pub: p.epub, fp: p.fp };
        nextEnc.set(p.fp, entry); // por huella de identidad (fp = fpOf(pub), y pub firma la epub → ligado)
        nextEnc.set(p.owner, entry); // por cuenta (owner === owner_id, firmado; último gana entre neuronas)
        // DIRECCIONAMIENTO v:3 POR-DISPOSITIVO RE-HABILITADO CON SEGURIDAD (Adenda 126,
        // cierra el CRÍTICO de la Adenda 125). El `device_id` SIGUE sin estar cubierto por
        // la firma soberana (el RLS solo fija owner_id = auth.uid()), así que SOLO se indexa
        // la epub por él cuando un CERT DE DISPOSITIVO firmado por la clave MAESTRA lo avala.
        // Cadena de garantías — TODAS obligatorias antes de confiar en encMap[device_id]:
        //   1) ancla TOFU: el mfp del cert debe ser el FIJADO para esta cuenta; en la
        //      PRIMERA visión válida se fija ahora (y como el RLS obliga owner_id=auth.uid(),
        //      solo el dueño publica filas de SU cuenta → solo él fija su mfp; un tercero no
        //      puede pre-fijar el de una víctima).
        //   2) verifyDeviceCert(devcert, ancla): mfp === ancla + mfp == huella(mpub) + firma ECDSA.
        //   3) devcert.account === row.owner_id        (el cert avala ESTA cuenta insertora).
        //   4) devcert.deviceFp === p.fp               (ata la identidad soberana ya verificada).
        //   5) devcert.relayDeviceId === row.device_id (ata el device_id de relé EXACTO).
        // Si algo falla, NO se indexa por device_id: un relé dirigido por dispositivo cae al
        // llavero compartido (encryptRelayBody → fallback v:1/2), nunca a texto plano.
        const devcert = p.devcert;
        const relayDev = String(row.device_id ?? "");
        if (devcert && devcert.mfp && relayDev) {
          const ownerKey = String(row.owner_id);
          const pinned = pins.get(ownerKey);
          const anchor = pinned ?? String(devcert.mfp); // primera visión: candidata = mfp del cert
          const okCert =
            (await verifyDeviceCert(devcert, anchor, { isCertRevoked: makeIsCertRevoked() })) && // firma + ancla (mfp === anchor) + CRL de cert
            devcert.account === ownerKey &&
            devcert.deviceFp === p.fp &&
            devcert.relayDeviceId === relayDev;
          if (okCert) {
            if (!pinned) {
              pins.set(ownerKey, anchor); // FIJA el ancla account→mfp en la primera visión VÁLIDA
              pinsDirty = true;
            }
            // ENDURECIMIENTO (más allá de las 5 comprobaciones): unicidad device_id→owner por
            // TOFU. El device_id es global y no lo hace único ninguna comprobación del cert, así
            // que sin esto DOS cuentas (cada una con su maestra) podrían reclamar el mismo
            // device_id y pelear por encMap[device_id] — la misma clase del CRÍTICO de la 125.
            // Se fija el device_id a la PRIMERA cuenta que lo reclama válidamente; otra cuenta
            // que lo reclame luego NO lo keyea (cae al llavero compartido, fail-safe).
            const devOwner = devicePins.get(relayDev);
            // Disputado en este lote (dos cuentas lo reclaman) → NO keyear (fail-safe).
            if (!contestedDevices.has(relayDev) && (!devOwner || devOwner === ownerKey)) {
              if (!devOwner) {
                devicePins.set(relayDev, ownerKey); // TOFU: primer dueño válido de este device_id
                devicePinsDirty = true;
              }
              nextEnc.set(relayDev, entry); // avalado por la maestra Y único por cuenta (TOFU)
            }
            // Si devOwner existe y ≠ ownerKey: device_id ya es de otra cuenta → NO keyear.
          }
        }
      }
    }
    idMap = next;
    encMap = nextEnc;
    if (pinsDirty) savePinMap(ACCOUNT_MFP_LS, pins); // persiste solo los anclas nuevos
    if (devicePinsDirty) savePinMap(DEVICE_OWNER_LS, devicePins);
  } catch {
    /* */
  }
}

/** Cuenta ligada a un fingerprint de identidad (verificada), o null. */
export function boundAccountFor(fp?: string): string | null {
  if (!fp) return null;
  if (revokedSet.has(fp)) return null; // identidad revocada: sin cuenta de confianza
  return idMap.get(fp) ?? null;
}

/**
 * Resuelve un destinatario (id de neurona, huella de identidad `id:…` o uuid de
 * cuenta) a su clave pública de CIFRADO ECDH publicada y VERIFICADA, o null si no la
 * conocemos (→ el emisor cae al llavero compartido, retrocompatible). Rechaza la
 * clave si la identidad que la avala está REVOCADA. Alimenta el relé v:3 por-destinatario.
 */
export function encryptionKeyFor(recipient?: string): JsonWebKey | null {
  if (!recipient) return null;
  const entry = encMap.get(recipient);
  if (!entry) return null;
  if (revokedSet.has(entry.fp)) return null; // identidad revocada: no cifrar hacia ella
  return entry.pub;
}

/**
 * Versión MULTI de `encryptionKeyFor` para el fan-out (Adenda 127): resuelve una lista de
 * destinatarios a sus claves de CIFRADO ECDH publicadas y verificadas, OMITIENDO los que no
 * tengan epub conocida o cuya identidad esté revocada (reutiliza `encryptionKeyFor`, así hereda
 * el mismo filtro de revocación). Dedup por destinatario. Alimenta el cifrado v:3 en lote
 * (`encryptEnvelopeForMany`). No resuelve el llavero compartido: eso es el fallback
 * por-destinatario de `encryptRelayBody` / `uploadRelayMulti`.
 */
export function encryptionKeysFor(recipients: string[]): Array<{ recipient: string; pub: JsonWebKey }> {
  const out: Array<{ recipient: string; pub: JsonWebKey }> = [];
  if (!Array.isArray(recipients)) return out;
  const seen = new Set<string>();
  for (const rcpt of recipients) {
    if (!rcpt || seen.has(rcpt)) continue;
    seen.add(rcpt);
    const pub = encryptionKeyFor(rcpt); // reusa resolución + filtro de revocación
    if (pub) out.push({ recipient: rcpt, pub });
  }
  return out;
}

/* ── REVOCACIÓN de identidades (Adenda 108) ─────────────────────────────────────
 * Una neurona puede REVOCAR su identidad (clave comprometida o rotación): firma
 * su acta de revocación con la clave actual, la publica y ROTA a una clave nueva.
 * Los receptores que ven un acta válida DESCARTAN el contenido firmado con la
 * huella revocada (no se entrega). La revocación es auto-autenticable: solo el
 * poseedor de la clave puede firmarla, así que el transporte no necesita confianza.
 * ---------------------------------------------------------------------------- */

/** ¿Está revocada esta huella de identidad? (contenido suyo no debe entregarse). */
export function isRevoked(fp?: string): boolean {
  return !!fp && revokedSet.has(fp);
}

/** Huella de identidad actual de esta neurona (para mostrarla en la UI). */
export async function currentFingerprint(): Promise<string | null> {
  return myFingerprint();
}

/**
 * Revoca la identidad ACTUAL y rota a una nueva: publica el acta firmada
 * (`kind:"revocation"`), retira el registro de identidad viejo y re-registra la
 * nueva. Best-effort: sin cliente/sesión sí rota la clave local igualmente.
 */
export async function revokeIdentity(): Promise<{ ok: boolean; oldFp?: string; newFp?: string }> {
  try {
    const rev = await signRevocation();
    if (!rev) return { ok: false };
    const supabase = await client();
    const owner = supabase ? await ownerId(supabase) : null;
    if (supabase && owner) {
      // Publica el acta de revocación (verificable por cualquiera, no caduca).
      await supabase.from("os_mesh_relay").insert({
        owner_id: owner,
        channel: "public",
        kind: "revocation",
        cls: "P3",
        ptype: "manifest",
        enc: false,
        payload: { fp: rev.fp, pub: rev.pub, sig: rev.sig },
        device_id: deviceId(),
        expires_at: null,
      });
      // Retira el registro de identidad viejo de esta neurona.
      await supabase.from("os_mesh_relay").delete().eq("owner_id", owner).eq("device_id", deviceId()).eq("kind", "identity");
    }
    revokedSet.add(rev.fp); // local inmediato
    // Rota a una clave nueva y re-registra la identidad nueva ↔ cuenta.
    const regenerated = await regenerateIdentity();
    identityRegistered = false;
    await registerIdentity();
    return { ok: true, oldFp: rev.fp, newFp: regenerated?.fp };
  } catch {
    return { ok: false };
  }
}

/** Refresca el conjunto VERIFICADO de identidades revocadas desde el registro público. */
export async function refreshRevocations(): Promise<void> {
  try {
    const supabase = await client();
    if (!supabase) return;
    const { data } = await supabase.from("os_mesh_relay").select("payload").eq("kind", "revocation").limit(500);
    if (!Array.isArray(data)) return;
    const next = new Set<string>(revokedSet); // conserva las ya conocidas (p. ej. la recién revocada)
    for (const row of data as Array<Record<string, unknown>>) {
      const p = (row.payload ?? null) as { fp?: string; pub?: JsonWebKey; sig?: string } | null;
      if (!p?.fp || !p.pub || !p.sig) continue;
      if (!(await verifyRevocation(p.fp, p.sig, p.pub))) continue; // acta inválida: se ignora
      next.add(p.fp);
    }
    revokedSet = next;
  } catch {
    /* */
  }
}

/**
 * Extrae de la bandeja de relé lo dirigido a esta neurona/cuenta y lo descifra.
 * `since` (epoch ms) limita a lo nuevo. RLS ya restringe a la propia cuenta.
 */
export async function pullRelayInbox(since: number): Promise<RelayInboundItem[]> {
  try {
    const supabase = await client();
    if (!supabase) return [];
    const owner = await ownerId(supabase);
    if (!owner) return [];
    const me = deviceId();
    const cutoff = new Date(Math.max(since, Date.now() - RELAY_TTL_MS)).toISOString();
    const { data, error } = await supabase
      .from("os_mesh_relay")
      .select("id, cls, ptype, enc, payload, recipient, device_id, created_at")
      .eq("channel", "relay")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data)) return [];
    const out: RelayInboundItem[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const recipient = row.recipient ? String(row.recipient) : null;
      // A mí: sin destinatario (a la cuenta) o dirigido a esta neurona; nunca lo
      // que yo mismo emití (device_id === me).
      if (String(row.device_id ?? "") === me) continue;
      if (recipient && recipient !== me) continue;
      let body: unknown = row.payload ?? null;
      let locked = false;
      if (row.enc === true) {
        const dec = await decryptEnvelope(row.payload as EncEnvelope);
        if (dec && typeof dec === "object") body = (dec as { body?: unknown }).body ?? dec;
        else {
          locked = true;
          body = null;
        }
      }
      out.push({
        id: String(row.id ?? ""),
        cls: (String(row.cls ?? "P2") as TrafficClass),
        ptype: (String(row.ptype ?? "message") as MeshPayloadType),
        body,
        from: row.device_id ? String(row.device_id) : null,
        at: row.created_at ? Date.parse(String(row.created_at)) : 0,
        locked,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Extrae del FEED PÚBLICO (channel="public", kind="data") el CONTENIDO publicado
 * por OTRAS neuronas de la red — cierra el bucle: publicar → almacenar → recibir.
 * `since` (epoch ms) limita a lo nuevo; excluye lo que emití yo. Texto plano (es
 * público). RLS: filas públicas legibles por cualquier neurona autenticada.
 */
export async function pullPublicFeed(since: number): Promise<RelayInboundItem[]> {
  try {
    const supabase = await client();
    if (!supabase) return [];
    const me = deviceId();
    const startISO = new Date(Math.max(since, Date.now() - RELAY_TTL_MS)).toISOString();
    // DRENADO keyset (Adenda 119): páginas ASCENDENTES por (created_at, id) hasta
    // agotar. Antes, un limit(50)+watermark perdía EN SILENCIO los ítems entre la
    // marca vieja y el 50.º más nuevo en ráfagas > 50. Se usa `gte` + dedup por id
    // DENTRO del drenado para NO saltarse filas que compartan created_at en el borde
    // de página (empate); se corta si una página no aporta filas nuevas (anti-bucle).
    // ⚠️ LIMITACIÓN CONOCIDA (revisión adversarial Adenda 128) — SEGUIMIENTO ABIERTO:
    // el cursor es por `created_at` y el watermark del llamador (synaptic.ts) también.
    // Si ≥FEED_PAGE filas comparten el MISMO created_at (insert masivo en una sola
    // transacción → `now()` idéntico), el watermark no puede cruzar ese instante y el
    // feed se atasca en él (DoS de descubrimiento; se autolimita ~24h por el floor).
    // El intento de la Adenda 127 (OFFSET estable) NO lo resolvía: el suelo sigue al
    // watermark, así que solo reubicaba el atasco (revertido). EL ARREGLO REAL es un
    // cursor keyset COMPUESTO (created_at, id) persistido en el llamador como par
    // (at, id) para avanzar por `id` DENTRO del empate — pendiente (cambia synaptic.ts).
    const out: RelayInboundItem[] = [];
    const drained = new Set<string>();
    let cursor = startISO;
    for (let page = 0; page < FEED_MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from("os_mesh_relay")
        .select("id, cls, ptype, payload, device_id, created_at")
        .eq("channel", "public")
        .eq("kind", "data")
        .gte("created_at", cursor)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(FEED_PAGE);
      if (error || !Array.isArray(data) || data.length === 0) break;
      let freshRows = 0;
      for (const row of data as Array<Record<string, unknown>>) {
        const id = String(row.id ?? "");
        if (id && drained.has(id)) continue; // borde re-incluido por gte: ya procesado
        if (id) drained.add(id);
        freshRows++;
        cursor = String(row.created_at ?? cursor);
        if (String(row.device_id ?? "") === me) continue; // no re-consumir lo mío
        const u = await unwrapFresh(row.payload, id);
        out.push({
          id,
          cls: String(row.cls ?? "P2") as TrafficClass,
          ptype: String(row.ptype ?? "post") as MeshPayloadType,
          body: u.body,
          from: row.device_id ? String(row.device_id) : null,
          at: row.created_at ? Date.parse(String(row.created_at)) : 0,
          locked: false,
          verified: u.verified,
          signerFp: u.fp,
        });
      }
      if (data.length < FEED_PAGE) break; // última página: agotado
      if (freshRows === 0) break; // página entera ya vista (empate masivo de created_at): corta
      if (page === FEED_MAX_PAGES - 1) {
        console.warn(`[mesh] pullPublicFeed: tope de ${FEED_MAX_PAGES} páginas por sondeo; el resto se drena en el próximo ciclo.`);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Lee el feed público de un SERVIDOR PROPIO por HTTP (GET `<endpoint>/mesh/public
 * ?since=<epoch_ms>`) — complementa el feed de Supabase para servidores custom.
 * El servidor responde `{items:[...]}` o un array. Best-effort; CORS/formatos
 * los define ese servidor. Ver el protocolo en architecture/servidor-propio-protocolo.md.
 */
export async function pullFromEndpoint(endpoint: string, since: number, token?: string): Promise<RelayInboundItem[]> {
  try {
    const url = `${endpoint.replace(/\/$/, "")}/mesh/public?since=${encodeURIComponent(String(since))}`;
    const res = await fetch(url, { method: "GET", headers: { accept: "application/json", ...authHeaders(token) } });
    if (!res.ok) return [];
    const j = (await res.json()) as unknown;
    const rows = Array.isArray(j)
      ? j
      : Array.isArray((j as { items?: unknown[] })?.items)
        ? (j as { items: unknown[] }).items
        : [];
    const me = deviceId();
    const out: RelayInboundItem[] = [];
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      if (String(row.device_id ?? "") === me) continue;
      if (typeof row.lc === "number") lamportObserve(row.lc); // avanza el reloj lógico (Adenda 115)
      const id = String(row.id ?? `${row.device_id ?? ""}-${row.at ?? row.created_at ?? ""}`);
      const u = await unwrapFresh(row.body ?? row.payload ?? row.envelope ?? null, id);
      out.push({
        id,
        cls: String(row.cls ?? "P2") as TrafficClass,
        ptype: String(row.ptype ?? row.type ?? "post") as MeshPayloadType,
        body: u.body,
        from: row.device_id ? String(row.device_id) : null,
        at: typeof row.at === "number" ? row.at : row.created_at ? Date.parse(String(row.created_at)) : 0,
        locked: false,
        verified: u.verified,
        signerFp: u.fp,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Endpoint del servidor propio ACTIVO de la cuenta (o null si es StarSeed). */
function activeAccountEndpoint(): string | null {
  try {
    return customEndpoint(getConnectivitySettings().serverId);
  } catch {
    return null;
  }
}

/** Feed público ADICIONAL del servidor propio activo (vacío si es StarSeed). */
export async function pullPublicExtra(since: number): Promise<RelayInboundItem[]> {
  const ep = activeAccountEndpoint();
  if (!ep) return [];
  return pullFromEndpoint(ep, since, activeAccountToken());
}

/**
 * Lee el BUZÓN DIRIGIDO de un servidor propio (GET `<endpoint>/mesh/relay
 * ?recipient=<deviceId>&since=<epoch_ms>`) — los mensajes de relé dirigidos a
 * esta neurona. El `body` puede venir cifrado E2E ({iv,ct}); se descifra en
 * cliente (el servidor propio tampoco lo lee). Adenda 104. Best-effort.
 */
export async function pullRelayFromEndpoint(endpoint: string, recipient: string, since: number, token?: string): Promise<RelayInboundItem[]> {
  try {
    const url = `${endpoint.replace(/\/$/, "")}/mesh/relay?recipient=${encodeURIComponent(recipient)}&since=${encodeURIComponent(String(since))}`;
    const res = await fetch(url, { method: "GET", headers: { accept: "application/json", ...authHeaders(token) } });
    if (!res.ok) return [];
    const j = (await res.json()) as unknown;
    const rows = Array.isArray(j)
      ? j
      : Array.isArray((j as { items?: unknown[] })?.items)
        ? (j as { items: unknown[] }).items
        : [];
    const me = deviceId();
    const out: RelayInboundItem[] = [];
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      if (String(row.device_id ?? "") === me) continue;
      let body: unknown = row.body ?? row.payload ?? row.envelope ?? null;
      let locked = false;
      if (body && typeof body === "object" && "iv" in (body as object) && "ct" in (body as object)) {
        const dec = await decryptEnvelope(body as EncEnvelope);
        if (dec && typeof dec === "object") body = (dec as { body?: unknown }).body ?? dec;
        else {
          locked = true;
          body = null;
        }
      }
      out.push({
        id: String(row.id ?? `${row.device_id ?? ""}-${row.at ?? ""}`),
        cls: String(row.cls ?? "P2") as TrafficClass,
        ptype: String(row.ptype ?? row.type ?? "message") as MeshPayloadType,
        body,
        from: row.device_id ? String(row.device_id) : null,
        at: typeof row.at === "number" ? row.at : row.created_at ? Date.parse(String(row.created_at)) : 0,
        locked,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Identidades de esta neurona a las que puede ir dirigido un relé (Adenda 105):
 *   · deviceId       — esta neurona concreta.
 *   · <owner uuid>   — la CUENTA (todas sus neuronas).
 *   · "group:<slug>" — cada GRUPO del que la cuenta es miembro (os_memberships).
 * Best-effort: sin sesión devuelve solo el deviceId.
 */
export async function neuronIdentities(): Promise<string[]> {
  const ids: string[] = [deviceId()];
  try {
    const supabase = await client();
    if (!supabase) return ids;
    const owner = await ownerId(supabase);
    if (!owner) return ids;
    ids.push(owner);
    try {
      const { data } = await supabase.from("os_memberships").select("group_slug").eq("user_id", owner);
      if (Array.isArray(data)) {
        for (const r of data as Array<Record<string, unknown>>) {
          const g = r.group_slug ? String(r.group_slug) : "";
          if (g) ids.push(`group:${g}`);
        }
      }
    } catch {
      /* sin tabla de membresías: solo cuenta + dispositivo */
    }
  } catch {
    /* */
  }
  return ids;
}

/**
 * Destinatarios de ENVÍO de un GRUPO (Adenda 127): espejo de `neuronIdentities` pero para
 * EMITIR. Lee `os_memberships` y devuelve los owner ids (`user_id`) de los miembros del grupo
 * — identificadores que `encryptionKeysFor` sabe resolver a epub. Best-effort y tolerante a
 * fallos: sin sesión / sin tabla / error → []. Dedup por owner. Nunca lanza.
 */
export async function groupRecipients(groupSlug: string): Promise<string[]> {
  const out: string[] = [];
  if (!groupSlug) return out;
  try {
    const supabase = await client();
    if (!supabase) return out;
    const { data } = await supabase.from("os_memberships").select("user_id").eq("group_slug", groupSlug);
    if (Array.isArray(data)) {
      const seen = new Set<string>();
      for (const r of data as Array<Record<string, unknown>>) {
        const uid = r.user_id ? String(r.user_id) : "";
        if (uid && !seen.has(uid)) {
          seen.add(uid);
          out.push(uid);
        }
      }
    }
  } catch {
    /* sin tabla de membresías / sin sesión: grupo vacío (best-effort) */
  }
  return out;
}

/**
 * Buzón dirigido ADICIONAL del servidor propio activo: recoge el relé dirigido a
 * CUALQUIERA de las identidades de la neurona (dispositivo, cuenta y grupos).
 */
export async function pullRelayExtra(since: number): Promise<RelayInboundItem[]> {
  const ep = activeAccountEndpoint();
  if (!ep) return [];
  const ids = await neuronIdentities();
  const token = activeAccountToken();
  const lists = await Promise.all(ids.map((id) => pullRelayFromEndpoint(ep, id, since, token)));
  return lists.flat();
}

/**
 * Suscripción REALTIME (SSE) al servidor propio activo (Adenda 106): abre un
 * EventSource a `<endpoint>/mesh/stream?recipients=<ids>` y entrega al instante el
 * feed público y el buzón dirigido a cualquiera de las identidades de la neurona,
 * sin esperar el sondeo. Best-effort (servidores abiertos; auth'd requiere token
 * en query). Devuelve unsubscribe. Nunca lanza.
 */
export function subscribeEndpointStream(onItem: (item: RelayInboundItem) => void): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};
  let es: EventSource | null = null;
  let cancelled = false;
  void (async () => {
    try {
      const ep = activeAccountEndpoint();
      if (!ep || cancelled) return;
      const ids = await neuronIdentities();
      const me = deviceId();
      const token = activeAccountToken();
      const url = `${ep}/mesh/stream?recipients=${encodeURIComponent(ids.join(","))}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
      es = new EventSource(url);
      es.onmessage = (ev: MessageEvent) => {
        void (async () => {
          try {
            const row = JSON.parse(String(ev.data)) as Record<string, unknown>;
            if (String(row.device_id ?? "") === me) return;
            let body: unknown = row.body ?? null;
            let verified = false;
            let signerFp: string | undefined;
            if (String(row.channel ?? "") === "relay") {
              if (body && typeof body === "object" && "iv" in (body as object) && "ct" in (body as object)) {
                const dec = await decryptEnvelope(body as EncEnvelope);
                if (dec && typeof dec === "object") body = (dec as { body?: unknown }).body ?? dec;
                else return;
              }
            } else {
              const u = await unwrapFresh(body, String(row.id ?? `${row.device_id ?? ""}-${row.at ?? ""}`));
              body = u.body;
              verified = u.verified;
              signerFp = u.fp;
            }
            onItem({
              id: String(row.id ?? `${row.device_id ?? ""}-${row.at ?? ""}`),
              cls: String(row.cls ?? "P2") as TrafficClass,
              ptype: String(row.ptype ?? row.type ?? "post") as MeshPayloadType,
              body,
              from: row.device_id ? String(row.device_id) : null,
              at: typeof row.at === "number" ? row.at : 0,
              locked: false,
              verified,
              signerFp,
            });
          } catch {
            /* */
          }
        })();
      };
      es.onerror = () => {
        /* EventSource reintenta solo */
      };
      if (cancelled) {
        try {
          es.close();
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
  })();
  return () => {
    cancelled = true;
    try {
      es?.close();
    } catch {
      /* */
    }
  };
}

/**
 * Suscripción REALTIME a `os_mesh_relay` (INSERT) para entrega INSTANTÁNEA sin
 * esperar el sondeo (Adenda 105): contenido público / relé propio → `onContent`;
 * faros → `onBeacon`. Best-effort: si el realtime no está publicado/disponible,
 * no hace nada y el sondeo sigue cubriéndolo. Devuelve unsubscribe. Nunca lanza.
 */
export function subscribeRelayRealtime(handlers: {
  onContent: (item: RelayInboundItem) => void;
  onBeacon: () => void;
}): () => void {
  let channel: unknown = null;
  let cancelled = false;
  void (async () => {
    try {
      const supabase = await client();
      if (!supabase || cancelled) return;
      const me = deviceId();
      const ch = (supabase as unknown as { channel: (n: string) => any })
        .channel("ss-mesh-relay-live")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "os_mesh_relay" },
          async (payload: { new?: Record<string, unknown> }) => {
            try {
              const row = payload?.new;
              if (!row) return;
              if (String(row.device_id ?? "") === me) return; // no lo mío
              const kind = String(row.kind ?? "");
              const channelName = String(row.channel ?? "");
              if (kind === "beacon") {
                handlers.onBeacon();
                return;
              }
              if (kind !== "data") return;
              let body: unknown = row.payload ?? null;
              let verified = false;
              let signerFp: string | undefined;
              if (channelName === "relay" && row.enc === true) {
                const dec = await decryptEnvelope(row.payload as EncEnvelope);
                if (dec && typeof dec === "object") body = (dec as { body?: unknown }).body ?? dec;
                else return; // cifrado sin clave: no entregable
              } else {
                const u = await unwrapFresh(row.payload, String(row.id ?? "")); // público firmado
                body = u.body;
                verified = u.verified;
                signerFp = u.fp;
              }
              handlers.onContent({
                id: String(row.id ?? ""),
                cls: String(row.cls ?? "P2") as TrafficClass,
                ptype: String(row.ptype ?? "post") as MeshPayloadType,
                body,
                from: row.device_id ? String(row.device_id) : null,
                at: row.created_at ? Date.parse(String(row.created_at)) : 0,
                locked: false,
                verified,
                signerFp,
              });
            } catch {
              /* */
            }
          },
        )
        .subscribe();
      channel = ch;
      if (cancelled) {
        try {
          (supabase as unknown as { removeChannel: (c: unknown) => void }).removeChannel(ch);
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
  })();
  return () => {
    cancelled = true;
    void (async () => {
      try {
        if (!channel) return;
        const supabase = await client();
        (supabase as unknown as { removeChannel: (c: unknown) => void } | null)?.removeChannel(channel);
      } catch {
        /* */
      }
    })();
  };
}
