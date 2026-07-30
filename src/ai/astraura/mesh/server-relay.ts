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

import { getMeshPrivacy } from "./privacy";
import { getConnectivitySettings } from "./connectivity";
import { getMeshServer } from "./servers";
import { wrapSigned, unwrapSigned } from "./mesh-identity";
import { deviceId } from "./federation";
import { encryptEnvelope, decryptEnvelope, type EncEnvelope } from "./relay-crypto";
import { getActiveModemPreset } from "./sync";
import { getMeshState } from "./store";
import type { MeshPayloadType, TrafficClass } from "./types";

/** Ventana de frescura de un faro (más viejo = neurona apagada). */
const BEACON_FRESH_MS = 4 * 60_000;
/** Caducidad que se graba en la fila (limpieza). */
const RELAY_TTL_MS = 24 * 60 * 60_000;
const BEACON_TTL_MS = 5 * 60_000;

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

/**
 * POST genérico a un servidor propio (público o privado añadido por la cuenta/
 * grupo). Best-effort: si el endpoint no responde o CORS lo bloquea, se informa
 * y la entrega hará failover. El protocolo es un JSON simple {channel, envelope}.
 */
async function postToEndpoint(endpoint: string, channel: "public" | "relay", env: ServerEnvelope): Promise<ServerSendResult> {
  try {
    const res = await fetch(`${endpoint}/mesh/${channel}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, device_id: deviceId(), envelope: env }),
    });
    if (!res.ok) return { ok: false, detail: `servidor propio rechazó (${res.status})` };
    return { ok: true, detail: `enviado a tu servidor (${channel})` };
  } catch {
    return { ok: false, detail: "servidor propio inalcanzable (endpoint/CORS)" };
  }
}

/** Sube CONTENIDO PÚBLICO (texto plano, FIRMADO). Cualquiera de la red lo alcanza. */
export async function uploadPublic(env: ServerEnvelope, serverId?: string): Promise<ServerSendResult> {
  // Firma el contenido público (autenticidad + integridad); el receptor verifica.
  const signed = await wrapSigned(env.body);
  const ep = customEndpoint(serverId);
  if (ep) return postToEndpoint(ep, "public", { ...env, body: signed });
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

/** Sube un RELÉ PRIVADO cifrado. La nube solo transporta el texto cifrado. */
export async function uploadRelay(env: ServerEnvelope, serverId?: string): Promise<ServerSendResult> {
  const ep = customEndpoint(serverId);
  if (ep) {
    // Servidor propio: ciframos igualmente antes de salir (E2E; el servidor
    // propio tampoco lee el contenido privado).
    const enc = await encryptEnvelope({ cls: env.cls, ptype: env.ptype, body: env.body });
    if (!enc) return { ok: false, detail: "sin cifrado disponible: no se sube dato privado en claro" };
    return postToEndpoint(ep, "relay", { ...env, body: enc as unknown });
  }
  try {
    const supabase = await client();
    if (!supabase) return { ok: false, detail: "sin cliente de servidor" };
    const owner = await ownerId(supabase);
    if (!owner) return { ok: false, detail: "sin cuenta activa: se encola" };
    const enc = await encryptEnvelope({ cls: env.cls, ptype: env.ptype, body: env.body });
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
      payload: {},
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
      .select("device_id, label, region, preset, online_count, created_at")
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
      out.push({
        deviceId: dev,
        label: row.label ? String(row.label) : null,
        region: row.region ? String(row.region) : null,
        preset: row.preset ? String(row.preset) : null,
        onlineCount: typeof row.online_count === "number" ? row.online_count : 0,
        at: row.created_at ? Date.parse(String(row.created_at)) : 0,
        own: myDevices.has(dev),
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
    const cutoff = new Date(Math.max(since, Date.now() - RELAY_TTL_MS)).toISOString();
    const { data, error } = await supabase
      .from("os_mesh_relay")
      .select("id, cls, ptype, payload, device_id, created_at")
      .eq("channel", "public")
      .eq("kind", "data")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data)) return [];
    const out: RelayInboundItem[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      if (String(row.device_id ?? "") === me) continue; // no re-consumir lo mío
      const u = await unwrapSigned(row.payload);
      out.push({
        id: String(row.id ?? ""),
        cls: String(row.cls ?? "P2") as TrafficClass,
        ptype: String(row.ptype ?? "post") as MeshPayloadType,
        body: u.body,
        from: row.device_id ? String(row.device_id) : null,
        at: row.created_at ? Date.parse(String(row.created_at)) : 0,
        locked: false,
        verified: u.verified,
      });
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
export async function pullFromEndpoint(endpoint: string, since: number): Promise<RelayInboundItem[]> {
  try {
    const url = `${endpoint.replace(/\/$/, "")}/mesh/public?since=${encodeURIComponent(String(since))}`;
    const res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
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
      const u = await unwrapSigned(row.body ?? row.payload ?? row.envelope ?? null);
      out.push({
        id: String(row.id ?? `${row.device_id ?? ""}-${row.at ?? row.created_at ?? ""}`),
        cls: String(row.cls ?? "P2") as TrafficClass,
        ptype: String(row.ptype ?? row.type ?? "post") as MeshPayloadType,
        body: u.body,
        from: row.device_id ? String(row.device_id) : null,
        at: typeof row.at === "number" ? row.at : row.created_at ? Date.parse(String(row.created_at)) : 0,
        locked: false,
        verified: u.verified,
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
  return pullFromEndpoint(ep, since);
}

/**
 * Lee el BUZÓN DIRIGIDO de un servidor propio (GET `<endpoint>/mesh/relay
 * ?recipient=<deviceId>&since=<epoch_ms>`) — los mensajes de relé dirigidos a
 * esta neurona. El `body` puede venir cifrado E2E ({iv,ct}); se descifra en
 * cliente (el servidor propio tampoco lo lee). Adenda 104. Best-effort.
 */
export async function pullRelayFromEndpoint(endpoint: string, recipient: string, since: number): Promise<RelayInboundItem[]> {
  try {
    const url = `${endpoint.replace(/\/$/, "")}/mesh/relay?recipient=${encodeURIComponent(recipient)}&since=${encodeURIComponent(String(since))}`;
    const res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
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
 * Buzón dirigido ADICIONAL del servidor propio activo: recoge el relé dirigido a
 * CUALQUIERA de las identidades de la neurona (dispositivo, cuenta y grupos).
 */
export async function pullRelayExtra(since: number): Promise<RelayInboundItem[]> {
  const ep = activeAccountEndpoint();
  if (!ep) return [];
  const ids = await neuronIdentities();
  const lists = await Promise.all(ids.map((id) => pullRelayFromEndpoint(ep, id, since)));
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
      const url = `${ep}/mesh/stream?recipients=${encodeURIComponent(ids.join(","))}`;
      es = new EventSource(url);
      es.onmessage = (ev: MessageEvent) => {
        void (async () => {
          try {
            const row = JSON.parse(String(ev.data)) as Record<string, unknown>;
            if (String(row.device_id ?? "") === me) return;
            let body: unknown = row.body ?? null;
            let verified = false;
            if (String(row.channel ?? "") === "relay") {
              if (body && typeof body === "object" && "iv" in (body as object) && "ct" in (body as object)) {
                const dec = await decryptEnvelope(body as EncEnvelope);
                if (dec && typeof dec === "object") body = (dec as { body?: unknown }).body ?? dec;
                else return;
              }
            } else {
              const u = await unwrapSigned(body);
              body = u.body;
              verified = u.verified;
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
              if (channelName === "relay" && row.enc === true) {
                const dec = await decryptEnvelope(row.payload as EncEnvelope);
                if (dec && typeof dec === "object") body = (dec as { body?: unknown }).body ?? dec;
                else return; // cifrado sin clave: no entregable
              } else {
                const u = await unwrapSigned(row.payload); // público firmado
                body = u.body;
                verified = u.verified;
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
