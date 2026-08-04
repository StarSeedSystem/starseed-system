"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED POR NEURONA — rol de red declarado por dispositivo + cliente OpenWISP.
 * ---------------------------------------------------------------------------
 * Cada NEURONA (dispositivo de la cuenta, ver `src/lib/neurons/neurons.ts`)
 * puede declarar un ROL DE RED: router / punto-de-acceso / nodo-mesh /
 * gateway / ninguno. Este módulo NO edita `neurons.ts` (fuente de verdad de
 * `NeuronSettings`): vive en su propia clave `starseed.network.roles.v1` y se
 * referencia por el mismo `neuronId` que usa `src/lib/neurons/neurons.ts`.
 *
 * Con ese rol + los datos guardados (SSID, clave, mesh_id, país, CIDR de
 * LAN…) se puede GENERAR una configuración NetJSON real (`generateConfigForNeuron`,
 * ver `./netjson`) que el usuario copia y aplica en un controlador OpenWISP o
 * en un router OpenWrt — StarSeed nunca toca el hardware directamente (mismo
 * límite honesto que CasaOS/seguridad, ver cabecera de `./netjson`).
 *
 * También incluye:
 *  · Un cliente ligero de la API REST de OpenWISP Controller que SIEMPRE pasa
 *    por nuestra propia ruta proxy (`/api/network/openwisp`, con guarda
 *    anti-SSRF y sesión exigida) — nunca llama directo al controlador desde
 *    el navegador (evita CORS y evita exponer el token del usuario a SSRF).
 *  · El modelo de "señales de telecomunicaciones por antena" (`TelecomAntenna`):
 *    torres celulares, APs de un WISP, gateways LoRa, satélites o APs WiFi
 *    detectados/declarados, con CRUD local en `starseed.network.antennas.v1`,
 *    para alimentar la UI de un mapa/lista de señales.
 *
 * Todo el módulo es defensivo y SSR-safe: cualquier acceso a `window`/
 * `localStorage`/`fetch` está protegido y NUNCA lanza; ante fallo se degrada
 * a valores por defecto vacíos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  buildAccessPoint,
  buildBridge,
  buildMeshNode,
  buildRadio,
  buildStation,
  composeDeviceConfig,
  neuronRouterConfig,
  parseLanCidr,
  type NetJsonDeviceConfig,
  type NetJsonInterface,
} from "./netjson";

/* ═══════════════════════════════════════════════════════════════════════
 * 1) ROL DE RED por neurona
 * ═══════════════════════════════════════════════════════════════════════ */

export type NeuronNetworkRole = "router" | "access-point" | "mesh-node" | "gateway" | "none";

export const NEURON_NETWORK_KEY = "starseed.network.roles.v1";
/** Evento disparado en `window` cada vez que cambia algún rol de red guardado. */
export const NEURON_NETWORK_EVENT = "starseed:network-roles";

/**
 * Config de red de una neurona. Persiste LOCALMENTE (no viaja a Supabase ni a
 * ningún servidor de StarSeed): `ssid`/`key`/`controllerUrl` son datos que el
 * propio usuario introduce para GENERAR configuración o hablar con SU
 * controlador OpenWISP — nunca se envían a nadie salvo cuando el usuario
 * pulsa explícitamente "enviar a OpenWISP" (y entonces solo al `controllerUrl`
 * que él mismo configuró, vía el proxy anti-SSRF).
 */
export interface NeuronNetworkConfig {
  role: NeuronNetworkRole;
  /** SSID a emitir (roles router/access-point/gateway). */
  ssid?: string;
  /** Clave WPA2/WPA3 del SSID. Solo local; nunca se registra en logs. */
  key?: string;
  /** Identificador de malla 802.11s (roles router-con-malla/mesh-node). */
  meshId?: string;
  /** País ISO-3166 alpha-2 (regula canal/potencia permitidos del radio). */
  country?: string;
  /** CIDR de la LAN, p.ej. "192.168.90.1/24". */
  lanCidr?: string;
  /** URL del controlador OpenWISP de esta neurona (si la gestiona uno). */
  controllerUrl?: string;
  /** Id del dispositivo ya registrado en ese controlador OpenWISP. */
  deviceId?: string;
  /** Notas libres del usuario. */
  notes?: string;
}

export const DEFAULT_NETWORK_CONFIG: NeuronNetworkConfig = { role: "none" };

type NetworkRolesStore = Record<string, NeuronNetworkConfig>;

function readStore(): NetworkRolesStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NEURON_NETWORK_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as NetworkRolesStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: NetworkRolesStore): void {
  try {
    window.localStorage.setItem(NEURON_NETWORK_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(NEURON_NETWORK_EVENT));
  } catch {
    /* almacenamiento no disponible (privado/cuota): degradación silenciosa */
  }
}

/** Config de red de una neurona con los defaults aplicados. Nunca lanza. */
export function getNetworkConfig(neuronId: string): NeuronNetworkConfig {
  if (!neuronId) return { ...DEFAULT_NETWORK_CONFIG };
  const store = readStore();
  return { ...DEFAULT_NETWORK_CONFIG, ...(store[neuronId] ?? {}) };
}

/** Mezcla (merge no destructivo) un parche de config de red de una neurona y lo persiste. */
export function setNetworkConfig(neuronId: string, patch: Partial<NeuronNetworkConfig>): NeuronNetworkConfig {
  if (!neuronId) return { ...DEFAULT_NETWORK_CONFIG };
  const store = readStore();
  const next: NeuronNetworkConfig = { ...DEFAULT_NETWORK_CONFIG, ...(store[neuronId] ?? {}), ...patch };
  store[neuronId] = next;
  writeStore(store);
  return next;
}

/** Todas las configs de red guardadas, indexadas por neuronId. Nunca lanza. */
export function listNetworkConfigs(): Record<string, NeuronNetworkConfig> {
  return readStore();
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2) Generación de configuración NetJSON a partir del rol guardado
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * generateConfigForNeuron — traduce el rol de red guardado de una neurona en
 * una `NetJsonDeviceConfig` real (usando los generadores puros de `./netjson`).
 * Devuelve `null` si la neurona no tiene rol (`"none"`) o si el id está vacío.
 * Nunca lanza: cualquier fallo de construcción también devuelve `null`.
 */
export function generateConfigForNeuron(neuronId: string): NetJsonDeviceConfig | null {
  if (!neuronId) return null;
  const cfg = getNetworkConfig(neuronId);
  if (cfg.role === "none") return null;

  const hostname = `starseed-${neuronId}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 63);

  try {
    switch (cfg.role) {
      case "router": {
        return neuronRouterConfig({
          hostname,
          ssid: cfg.ssid || "StarSeed",
          key: cfg.key || "",
          meshId: cfg.meshId,
          country: cfg.country,
          lanCidr: cfg.lanCidr,
        });
      }

      case "access-point": {
        const radio = buildRadio({ name: "radio0", band: "2.4", country: cfg.country });
        const iface = buildAccessPoint({
          iface: "wlan0",
          radio: "radio0",
          ssid: cfg.ssid || "StarSeed",
          key: cfg.key || "",
          network: ["lan"],
        });
        return composeDeviceConfig({ hostname, radios: [radio], interfaces: [iface] });
      }

      case "mesh-node": {
        const radio = buildRadio({ name: "radio0", band: "5", country: cfg.country });
        const iface = buildMeshNode({
          iface: "mesh0",
          radio: "radio0",
          meshId: cfg.meshId || "starseed-mesh",
          network: ["lan"],
        });
        return composeDeviceConfig({ hostname, radios: [radio], interfaces: [iface] });
      }

      case "gateway": {
        // Gateway: AP local (radio 2,4G) + enlace WAN por estación a un router
        // externo (radio 5G) — puente entre la red StarSeed y una red ajena.
        const radio24 = buildRadio({ name: "radio0", band: "2.4", country: cfg.country });
        const radio5 = buildRadio({ name: "radio1", band: "5", country: cfg.country });
        const ap = buildAccessPoint({
          iface: "wlan0",
          radio: "radio0",
          ssid: cfg.ssid || "StarSeed",
          key: cfg.key || "",
          network: ["lan"],
        });
        const wan = buildStation({ iface: "wlan1", radio: "radio1", ssid: cfg.ssid || "", key: cfg.key, network: ["wan"] });
        const lan = parseLanCidr(cfg.lanCidr);
        const bridge = buildBridge({ name: "lan", members: ["eth0", "wlan0"], address: lan.address, mask: lan.mask });
        const interfaces: NetJsonInterface[] = [ap, wan, bridge];
        return composeDeviceConfig({ hostname, radios: [radio24, radio5], interfaces });
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * 3) Cliente OpenWISP (SIEMPRE vía nuestra ruta proxy — anti-SSRF/CORS)
 * ═══════════════════════════════════════════════════════════════════════ */

export interface OwResult<T = unknown> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
}

/** Subconjunto de campos de un Device de `openwisp-controller` usados por la UI. */
export interface OwDevice {
  id: string;
  name?: string;
  mac_address?: string;
  organization?: string;
  model?: string;
  os?: string;
  system?: string;
  last_ip?: string;
  management_ip?: string;
  config?: { status?: string; templates?: string[] } | null;
  [key: string]: unknown;
}

/**
 * owRequest — llamada genérica de bajo nivel a la API REST de OpenWISP,
 * SIEMPRE a través de `/api/network/openwisp` (nuestra ruta proxy con guarda
 * anti-SSRF y sesión Supabase exigida). Base de `owAuth`/`owListDevices`/
 * `owPushConfig`; también sirve para cualquier endpoint no cubierto por esos
 * atajos (plantillas, topología…). Defensivo: nunca lanza.
 */
export async function owRequest<T = unknown>(opts: {
  controllerUrl: string;
  path: string;
  method?: string;
  token?: string;
  body?: unknown;
}): Promise<OwResult<T>> {
  if (typeof window === "undefined") return { ok: false, error: "Solo disponible en el navegador." };
  if (!opts?.controllerUrl || !opts.controllerUrl.trim()) {
    return { ok: false, error: "Falta la URL del controlador OpenWISP." };
  }
  if (!opts?.path) return { ok: false, error: "Falta la ruta de la API de OpenWISP." };

  try {
    const res = await fetch("/api/network/openwisp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        controllerUrl: opts.controllerUrl,
        path: opts.path,
        method: opts.method || "GET",
        token: opts.token,
        body: opts.body,
      }),
    });

    let json: { ok?: boolean; status?: number; data?: T; error?: string } | null = null;
    try {
      json = (await res.json()) as { ok?: boolean; status?: number; data?: T; error?: string };
    } catch {
      json = null;
    }
    if (!json) return { ok: false, error: `Respuesta inválida del proxy de red (HTTP ${res.status}).` };
    if (json.ok === false) {
      return { ok: false, status: json.status, error: json.error || "El controlador OpenWISP devolvió un error." };
    }
    return { ok: true, status: json.status, data: json.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo contactar el proxy de red." };
  }
}

/** Autentica contra OpenWISP (`POST /api/v1/users/token/`) y devuelve el token. */
export async function owAuth(controllerUrl: string, username: string, password: string): Promise<OwResult<{ token: string }>> {
  const res = await owRequest<{ token?: string }>({
    controllerUrl,
    path: "/api/v1/users/token/",
    method: "POST",
    body: { username, password },
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error || "No se pudo autenticar con OpenWISP." };
  const token = res.data?.token;
  if (!token || typeof token !== "string") {
    return { ok: false, status: res.status, error: "La respuesta de OpenWISP no incluyó un token." };
  }
  return { ok: true, status: res.status, data: { token } };
}

/** Lista los dispositivos registrados en el controlador (`GET /api/v1/controller/device/`). */
export async function owListDevices(controllerUrl: string, token: string): Promise<OwResult<OwDevice[]>> {
  const res = await owRequest<OwDevice[] | { results?: OwDevice[] }>({
    controllerUrl,
    path: "/api/v1/controller/device/",
    method: "GET",
    token,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const data = res.data;
  let list: OwDevice[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && Array.isArray(data.results)) {
    list = data.results;
  }
  return { ok: true, status: res.status, data: list };
}

/**
 * Asigna plantillas de configuración a un dispositivo OpenWISP
 * (`PATCH /api/v1/controller/device/{id}/`, body `{config:{templates:[...]}}`).
 */
export async function owPushConfig(
  controllerUrl: string,
  token: string,
  deviceId: string,
  templateIds: string[],
): Promise<OwResult<OwDevice>> {
  if (!deviceId) return { ok: false, error: "Falta el id del dispositivo en OpenWISP." };
  return owRequest<OwDevice>({
    controllerUrl,
    path: `/api/v1/controller/device/${encodeURIComponent(deviceId)}/`,
    method: "PATCH",
    token,
    body: { config: { templates: Array.isArray(templateIds) ? templateIds : [] } },
  });
}

/* ═══════════════════════════════════════════════════════════════════════
 * 4) Señales de telecomunicaciones por antena (modelo para la UI)
 * ═══════════════════════════════════════════════════════════════════════ */

export type TelecomAntennaKind = "cell-tower" | "wisp-ap" | "lora-gateway" | "satellite" | "wifi-ap";

/**
 * Una antena/fuente de señal de telecomunicaciones conocida (torre celular,
 * AP de un WISP, gateway LoRa, satélite, AP WiFi…). Puede venir de una
 * detección automática (p.ej. un gateway LoRa visto en la malla) o de un
 * registro manual del usuario. Alimenta la UI de un mapa/lista de señales
 * (pestaña "Router"/señales del Centro de Conexiones).
 */
export interface TelecomAntenna {
  id: string;
  kind: TelecomAntennaKind;
  label: string;
  band?: string;
  dbm?: number;
  lat?: number;
  lon?: number;
  /** Neurona que la detectó/declaró, si aplica. */
  neuronId?: string;
  /** ISO 8601 — última vez vista/actualizada. */
  lastSeen?: string;
}

export const NEURON_ANTENNAS_KEY = "starseed.network.antennas.v1";
/** Evento disparado en `window` cada vez que cambia el inventario de antenas. */
export const NEURON_ANTENNAS_EVENT = "starseed:network-antennas";

function newAntennaId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function readAntennas(): TelecomAntenna[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NEURON_ANTENNAS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is TelecomAntenna => !!a && typeof a === "object" && typeof (a as TelecomAntenna).id === "string",
    );
  } catch {
    return [];
  }
}

function writeAntennas(list: TelecomAntenna[]): void {
  try {
    window.localStorage.setItem(NEURON_ANTENNAS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(NEURON_ANTENNAS_EVENT));
  } catch {
    /* almacenamiento no disponible: degradación silenciosa */
  }
}

/** Inventario local completo de antenas/señales conocidas. Nunca lanza. */
export function listAntennas(): TelecomAntenna[] {
  return readAntennas();
}

/**
 * Crea o actualiza una antena por `id` (si no trae `id`, se genera uno).
 * Actualiza `lastSeen` a "ahora" si no se especifica. Devuelve el inventario
 * completo tras la operación. Nunca lanza.
 */
export function upsertAntenna(antenna: Partial<TelecomAntenna> & { kind: TelecomAntennaKind; label: string }): TelecomAntenna[] {
  if (!antenna || !antenna.kind || !antenna.label) return readAntennas();
  const list = readAntennas();
  const id = antenna.id || newAntennaId();
  const next: TelecomAntenna = { ...antenna, id, lastSeen: antenna.lastSeen || new Date().toISOString() };
  const idx = list.findIndex((a) => a.id === id);
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.push(next);
  writeAntennas(list);
  return list;
}

/** Elimina una antena por id. Devuelve el inventario resultante. Nunca lanza. */
export function removeAntenna(id: string): TelecomAntenna[] {
  const list = readAntennas().filter((a) => a.id !== id);
  writeAntennas(list);
  return list;
}
