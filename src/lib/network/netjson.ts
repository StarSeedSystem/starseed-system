/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NetJSON — tipos y generadores PUROS del formato de configuración de red
 * abierto (Adenda: Red por Neurona · OpenWISP).
 * ---------------------------------------------------------------------------
 * StarSeed OS es una WEB (Vercel / Cloud Run): NO configura routers de forma
 * directa (no hay acceso de bajo nivel a hardware de red desde el navegador).
 * En su lugar GENERA la configuración en formato NetJSON/UCI para que el
 * usuario la aplique en un controlador OpenWISP o directamente en un router
 * OpenWrt. Es el MISMO patrón honesto que ya usa el repo con CasaOS
 * (`src/lib/neurons/neurons.ts`) y con la política de seguridad
 * (`src/lib/security/security.ts`): "StarSeed guarda/genera la política, el
 * dispositivo la aplica".
 *
 * Qué es NetJSON: un formato JSON abierto para describir configuraciones y
 * topologías de red (DeviceConfiguration, NetworkGraph…). Lo consume de forma
 * nativa `netjsonconfig` (librería Python de OpenWISP, licencia GPLv3) y el
 * propio `openwisp-controller`. AQUÍ NO SE REIMPLEMENTA NI SE DISTRIBUYE ESA
 * LIBRERÍA: este módulo solo genera/valida el FORMATO JSON, que es abierto y
 * está documentado en https://netjson.org — no arrastra ninguna licencia de
 * OpenWISP sobre este archivo.
 *
 * Referencias:
 *  · NetJSON DeviceConfiguration/NetworkGraph — https://netjson.org
 *  · netjsonconfig (OpenWISP, Python, GPLv3)   — https://github.com/openwisp/netjsonconfig
 *  · OpenWISP Controller                        — https://github.com/openwisp/openwisp-controller
 *
 * Módulo PURO: sin React, sin `window`/`fetch`/`localStorage`, sin efectos
 * secundarios. Isomorfo (server + client). Código defensivo: ningún
 * generador lanza — ante entradas incompletas produce igualmente un objeto
 * bien formado (con valores por defecto sensatos); usa `validateDeviceConfig`
 * para comprobar invariantes antes de mostrar/enviar una config.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ───────────────────────── Tipos NetJSON: DeviceConfiguration ───────────────────────── */

/** Modos wireless válidos en NetJSON/OpenWrt. */
export type NetJsonWirelessMode = "access_point" | "station" | "adhoc" | "monitor" | "802.11s";

export interface NetJsonRadio {
  name: string;
  phy?: string;
  driver?: string;
  /** p.ej. "802.11n" (2,4 GHz) · "802.11ac" (5 GHz) · "802.11ax" (WiFi 6). */
  protocol: string;
  channel: number;
  /** Ancho de canal en MHz (20/40/80/160…). */
  channel_width: number;
  tx_power?: number;
  /** Código de país ISO-3166 alpha-2 (regula canales/potencia permitidos). */
  country?: string;
}

export interface NetJsonEncryption {
  protocol: "wpa2_personal" | "wpa3_personal" | "wpa2_enterprise" | "none";
  cipher?: string;
  key?: string;
}

export interface NetJsonWireless {
  /** Nombre del `NetJsonRadio` al que está atada esta interfaz. */
  radio: string;
  mode: NetJsonWirelessMode;
  /** Requerido en modo "access_point"/"station" (ausente en "802.11s"). */
  ssid?: string;
  /** Requerido y OBLIGATORIO en modo "802.11s" (malla; nunca usa ssid). */
  mesh_id?: string;
  bssid?: string;
  /** Redes lógicas (uci) a las que se asocia — p.ej. ["lan"] para entrar al bridge LAN. */
  network?: string[];
  encryption?: NetJsonEncryption;
}

export interface NetJsonWirelessInterface {
  name: string;
  type: "wireless";
  wireless: NetJsonWireless;
}

export interface NetJsonAddress {
  address: string;
  /** Prefijo/máscara en bits (p.ej. 24). */
  mask: number;
  proto: "static" | "dhcp";
  family: "ipv4" | "ipv6";
}

export interface NetJsonBridgeInterface {
  name: string;
  type: "bridge";
  /** Nombres de interfaces físicas/lógicas que se unen en el bridge. */
  bridge_members: string[];
  addresses?: NetJsonAddress[];
}

export interface NetJsonEthernetInterface {
  name: string;
  type: "ethernet";
  addresses?: NetJsonAddress[];
}

export type NetJsonInterface = NetJsonWirelessInterface | NetJsonBridgeInterface | NetJsonEthernetInterface;

/**
 * Entrada de passthrough UCI (usada para DHCP y, en general, cualquier
 * config UCI no modelada explícitamente por NetJSON). `config_name` es el
 * tipo de sección UCI (p.ej. "dhcp"), `config_value` su nombre (p.ej. "lan");
 * el resto de claves se vuelcan como `option`/`list` UCI tal cual.
 */
export interface NetJsonDhcpEntry {
  config_name: string;
  config_value?: string;
  [key: string]: unknown;
}

export interface NetJsonGeneral {
  hostname: string;
  timezone?: string;
  [key: string]: unknown;
}

export interface NetJsonDeviceConfig {
  general: NetJsonGeneral;
  radios: NetJsonRadio[];
  interfaces: NetJsonInterface[];
  dns_servers?: string[];
  dns_search?: string[];
  /** Passthrough UCI top-level para "dhcp" (netjsonconfig no modela DHCP nativamente). */
  dhcp?: NetJsonDhcpEntry[];
}

/* ───────────────────────── Tipos NetJSON: NetworkGraph ───────────────────────── */

export interface NetJsonNode {
  id: string;
  label?: string;
  local_addresses?: string[];
  properties?: Record<string, unknown>;
}

export interface NetJsonLink {
  source: string;
  target: string;
  cost: number;
  properties?: Record<string, unknown>;
}

export interface NetJsonNetworkGraph {
  type: "NetworkGraph";
  protocol: string;
  version: string;
  metric: string;
  label?: string;
  nodes: NetJsonNode[];
  links: NetJsonLink[];
}

/* ───────────────────────── Utilidades internas (puras) ───────────────────────── */

/** Rango LAN privado por defecto cuando no hay CIDR válido. */
const DEFAULT_LAN = { address: "192.168.90.1", mask: 24 };

/**
 * Parsea un CIDR IPv4 tipo "192.168.90.1/24" en {address, mask}. Defensivo:
 * ante cualquier entrada ausente o inválida devuelve el rango LAN por
 * defecto — nunca lanza.
 */
export function parseLanCidr(cidr?: string | null): { address: string; mask: number } {
  if (!cidr || typeof cidr !== "string") return { ...DEFAULT_LAN };
  const m = cidr.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) return { ...DEFAULT_LAN };
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  const mask = Number(m[5]);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return { ...DEFAULT_LAN };
  if (!Number.isInteger(mask) || mask < 0 || mask > 32) return { ...DEFAULT_LAN };
  return { address: octets.join("."), mask };
}

/* ───────────────────────── Generadores: interfaces ───────────────────────── */

/** Interfaz wireless en modo Access Point (emite un SSID con clave WPA2). */
export function buildAccessPoint(opts: {
  iface: string;
  radio: string;
  ssid: string;
  key: string;
  network?: string[];
}): NetJsonWirelessInterface {
  const ssid = (opts?.ssid ?? "").toString().trim().slice(0, 32) || "StarSeed";
  const wireless: NetJsonWireless = {
    radio: (opts?.radio ?? "").toString(),
    mode: "access_point",
    ssid,
  };
  const network = opts?.network;
  if (Array.isArray(network) && network.length) {
    wireless.network = network.filter((n) => typeof n === "string" && n);
  }
  const key = (opts?.key ?? "").toString();
  if (key) wireless.encryption = { protocol: "wpa2_personal", cipher: "ccmp", key };
  return { name: (opts?.iface ?? "").toString() || "wlan0", type: "wireless", wireless };
}

/** Interfaz wireless en modo malla 802.11s (usa `mesh_id`, NUNCA `ssid`). */
export function buildMeshNode(opts: {
  iface: string;
  radio: string;
  meshId: string;
  network?: string[];
}): NetJsonWirelessInterface {
  const meshId = (opts?.meshId ?? "").toString().trim().slice(0, 32) || "starseed-mesh";
  const wireless: NetJsonWireless = {
    radio: (opts?.radio ?? "").toString(),
    mode: "802.11s",
    mesh_id: meshId,
  };
  const network = opts?.network;
  if (Array.isArray(network) && network.length) {
    wireless.network = network.filter((n) => typeof n === "string" && n);
  }
  return { name: (opts?.iface ?? "").toString() || "mesh0", type: "wireless", wireless };
}

/** Interfaz wireless en modo estación (cliente de un AP/router externo). */
export function buildStation(opts: {
  iface: string;
  radio: string;
  ssid: string;
  key?: string;
  bssid?: string;
  network?: string[];
}): NetJsonWirelessInterface {
  const wireless: NetJsonWireless = {
    radio: (opts?.radio ?? "").toString(),
    mode: "station",
    ssid: (opts?.ssid ?? "").toString().trim().slice(0, 32),
  };
  const bssid = opts?.bssid;
  if (bssid) wireless.bssid = bssid;
  const network = opts?.network;
  if (Array.isArray(network) && network.length) {
    wireless.network = network.filter((n) => typeof n === "string" && n);
  }
  const key = (opts?.key ?? "").toString();
  if (key) wireless.encryption = { protocol: "wpa2_personal", cipher: "ccmp", key };
  return { name: (opts?.iface ?? "").toString() || "wlan-sta", type: "wireless", wireless };
}

/** Interfaz bridge (une varias interfaces físicas/lógicas en una LAN con IP propia). */
export function buildBridge(opts: {
  name: string;
  members: string[];
  address: string;
  mask?: number;
}): NetJsonBridgeInterface {
  const address = (opts?.address ?? "").toString().trim();
  const maskRaw = opts?.mask;
  const mask = Number.isFinite(maskRaw) ? Number(maskRaw) : 24;
  const members = opts?.members;
  return {
    name: (opts?.name ?? "").toString() || "br-lan",
    type: "bridge",
    bridge_members: Array.isArray(members) ? members.filter((m) => typeof m === "string" && m) : [],
    addresses: address ? [{ address, mask, proto: "static", family: "ipv4" }] : [],
  };
}

/** Radio físico (banda 2,4 GHz o 5 GHz) con valores por defecto sensatos. */
export function buildRadio(opts: {
  name: string;
  band: "2.4" | "5";
  channel?: number;
  width?: number;
  country?: string;
}): NetJsonRadio {
  const band: "2.4" | "5" = opts?.band === "5" ? "5" : "2.4";
  const name = (opts?.name ?? "").toString().trim() || (band === "5" ? "radio1" : "radio0");
  const channelRaw = opts?.channel;
  const widthRaw = opts?.width;
  const channel = Number.isFinite(channelRaw) ? Number(channelRaw) : band === "5" ? 36 : 1;
  const channel_width = Number.isFinite(widthRaw) ? Number(widthRaw) : band === "5" ? 80 : 20;
  const radio: NetJsonRadio = {
    name,
    protocol: band === "5" ? "802.11ac" : "802.11n",
    channel,
    channel_width,
  };
  const country = (opts?.country ?? "").toString().trim();
  if (country) radio.country = country.toUpperCase().slice(0, 2);
  return radio;
}

/** Compone un `NetJsonDeviceConfig` a partir de sus piezas ya construidas. */
export function composeDeviceConfig(opts: {
  hostname: string;
  radios: NetJsonRadio[];
  interfaces: NetJsonInterface[];
  dhcp?: NetJsonDhcpEntry[];
}): NetJsonDeviceConfig {
  const hostname = (opts?.hostname ?? "").toString().trim().slice(0, 63) || "starseed-neuron";
  const radios = opts?.radios;
  const ifaces = opts?.interfaces;
  const dhcpRaw = opts?.dhcp;
  const cfg: NetJsonDeviceConfig = {
    general: { hostname },
    radios: Array.isArray(radios) ? radios : [],
    interfaces: Array.isArray(ifaces) ? ifaces : [],
  };
  if (Array.isArray(dhcpRaw) && dhcpRaw.length) cfg.dhcp = dhcpRaw;
  return cfg;
}

/* ───────────────────────── Preset de alto nivel ───────────────────────── */

/**
 * neuronRouterConfig — config de una "neurona-router" típica: radio0 en
 * 2,4 GHz como Access Point, radio1 en 5 GHz (como AP secundario "-5G", o
 * como nodo de malla 802.11s si se pasa `meshId`), bridge LAN uniendo
 * ethernet + wireless con IP estática, y DHCP server sobre esa LAN.
 * Es el preset de alto nivel para el caso de uso más común: "quiero que esta
 * neurona reparta WiFi e integre malla al mismo tiempo".
 */
export function neuronRouterConfig(opts: {
  hostname: string;
  ssid: string;
  key: string;
  meshId?: string;
  country?: string;
  lanCidr?: string;
}): NetJsonDeviceConfig {
  const lan = parseLanCidr(opts?.lanCidr);
  const radio24 = buildRadio({ name: "radio0", band: "2.4", country: opts?.country });
  const radio5 = buildRadio({ name: "radio1", band: "5", country: opts?.country });

  const interfaces: NetJsonInterface[] = [];
  const lanMembers: string[] = ["eth0"];

  // Radio 2,4 GHz: siempre Access Point (mejor alcance/compatibilidad universal).
  interfaces.push(
    buildAccessPoint({ iface: "wlan0", radio: "radio0", ssid: opts?.ssid ?? "", key: opts?.key ?? "", network: ["lan"] }),
  );
  lanMembers.push("wlan0");

  const meshId = opts?.meshId;
  if (meshId) {
    // Con meshId: radio 5 GHz dedicada a la malla 802.11s (backhaul de más ancho de banda).
    interfaces.push(buildMeshNode({ iface: "mesh0", radio: "radio1", meshId, network: ["lan"] }));
    lanMembers.push("mesh0");
  } else {
    // Sin malla: la 5 GHz es un segundo SSID de la misma red (banda dual clásica).
    interfaces.push(
      buildAccessPoint({
        iface: "wlan1",
        radio: "radio1",
        ssid: `${(opts?.ssid ?? "StarSeed").toString().trim() || "StarSeed"}-5G`,
        key: opts?.key ?? "",
        network: ["lan"],
      }),
    );
    lanMembers.push("wlan1");
  }

  interfaces.push(buildBridge({ name: "lan", members: lanMembers, address: lan.address, mask: lan.mask }));

  // DHCP server sobre la LAN (passthrough UCI — ver NetJsonDhcpEntry).
  const dhcp: NetJsonDhcpEntry[] = [
    {
      config_name: "dhcp",
      config_value: "lan",
      interface: "lan",
      start: 100,
      limit: 150,
      leasetime: "12h",
    },
  ];

  return composeDeviceConfig({ hostname: opts?.hostname ?? "", radios: [radio24, radio5], interfaces, dhcp });
}

/* ───────────────────────── Serialización y validación ───────────────────────── */

/** Serializa cualquier estructura NetJSON a JSON legible. Nunca lanza. */
export function toPrettyJson(cfg: unknown): string {
  try {
    return JSON.stringify(cfg, null, 2);
  } catch {
    return "{}";
  }
}

const VALID_WIRELESS_MODES: readonly NetJsonWirelessMode[] = [
  "access_point",
  "station",
  "adhoc",
  "monitor",
  "802.11s",
];

const VALID_ENCRYPTION_PROTOCOLS: readonly string[] = [
  "wpa2_personal",
  "wpa3_personal",
  "wpa2_enterprise",
  "none",
];

/**
 * Validador ligero de un `NetJsonDeviceConfig`: comprueba invariantes básicas
 * (hostname presente, radios con canal/ancho válidos, modos wireless válidos,
 * `mesh_id` obligatorio en 802.11s, `ssid` obligatorio en access_point,
 * referencias `wireless.radio` → radio declarado, nombres de interfaz únicos,
 * claves de cifrado con longitud mínima). NUNCA lanza: ante entradas
 * malformadas devuelve `{ok:false, errors:[...]}`.
 */
export function validateDeviceConfig(cfg: NetJsonDeviceConfig | null | undefined): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!cfg || typeof cfg !== "object") {
    return { ok: false, errors: ["Configuración vacía o no es un objeto."] };
  }
  if (!cfg.general || typeof cfg.general.hostname !== "string" || !cfg.general.hostname.trim()) {
    errors.push("Falta 'general.hostname'.");
  }

  const radios = Array.isArray(cfg.radios) ? cfg.radios : null;
  if (!radios) errors.push("'radios' debe ser un array.");
  const radioNames = new Set<string>();
  (radios ?? []).forEach((r, i) => {
    if (!r || typeof r.name !== "string" || !r.name.trim()) {
      errors.push(`radios[${i}]: falta 'name'.`);
    } else {
      radioNames.add(r.name);
    }
    if (!r || !Number.isFinite(r.channel)) errors.push(`radios[${i}] (${r?.name ?? "?"}): 'channel' inválido.`);
    if (!r || !Number.isFinite(r.channel_width)) errors.push(`radios[${i}] (${r?.name ?? "?"}): 'channel_width' inválido.`);
  });

  const interfaces = Array.isArray(cfg.interfaces) ? cfg.interfaces : null;
  if (!interfaces) errors.push("'interfaces' debe ser un array.");
  const ifaceNames = new Set<string>();
  (interfaces ?? []).forEach((iface, i) => {
    if (!iface || typeof iface.name !== "string" || !iface.name.trim()) {
      errors.push(`interfaces[${i}]: falta 'name'.`);
      return;
    }
    if (ifaceNames.has(iface.name)) errors.push(`interfaces[${i}]: nombre de interfaz duplicado ('${iface.name}').`);
    ifaceNames.add(iface.name);

    if (iface.type === "wireless") {
      const w = iface.wireless;
      if (!w) {
        errors.push(`interfaces[${i}] (${iface.name}): falta 'wireless'.`);
        return;
      }
      if (!w.radio || !radioNames.has(w.radio)) {
        errors.push(`interfaces[${i}] (${iface.name}): 'wireless.radio' ('${w.radio}') no coincide con ningún radio declarado.`);
      }
      if (!VALID_WIRELESS_MODES.includes(w.mode)) {
        errors.push(`interfaces[${i}] (${iface.name}): modo wireless inválido ('${w.mode}').`);
      }
      if (w.mode === "802.11s" && !w.mesh_id) {
        errors.push(`interfaces[${i}] (${iface.name}): el modo 802.11s requiere 'mesh_id'.`);
      }
      if (w.mode === "access_point" && !w.ssid) {
        errors.push(`interfaces[${i}] (${iface.name}): el modo access_point requiere 'ssid'.`);
      }
      if (w.encryption) {
        if (!VALID_ENCRYPTION_PROTOCOLS.includes(w.encryption.protocol)) {
          errors.push(`interfaces[${i}] (${iface.name}): protocolo de cifrado inválido ('${w.encryption.protocol}').`);
        }
        if (w.encryption.protocol !== "none" && (!w.encryption.key || w.encryption.key.length < 8)) {
          errors.push(`interfaces[${i}] (${iface.name}): clave de cifrado demasiado corta (mínimo 8 caracteres).`);
        }
      }
    } else if (iface.type === "bridge") {
      if (!Array.isArray(iface.bridge_members) || !iface.bridge_members.length) {
        errors.push(`interfaces[${i}] (${iface.name}): 'bridge_members' vacío.`);
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

/* ───────────────────────── NetworkGraph ───────────────────────── */

/** Construye un `NetJsonNetworkGraph` a partir de nodos/enlaces ya calculados. */
export function buildNetworkGraph(
  nodes: NetJsonNode[],
  links: NetJsonLink[],
  opts?: { protocol?: string; version?: string; metric?: string; label?: string },
): NetJsonNetworkGraph {
  const graph: NetJsonNetworkGraph = {
    type: "NetworkGraph",
    protocol: opts?.protocol || "static",
    version: opts?.version || "1",
    metric: opts?.metric || "hop_count",
    nodes: Array.isArray(nodes) ? nodes.filter((n) => n && typeof n.id === "string" && n.id) : [],
    links: Array.isArray(links)
      ? links.filter((l) => l && typeof l.source === "string" && typeof l.target === "string")
      : [],
  };
  const label = opts?.label;
  if (label) graph.label = label;
  return graph;
}

/**
 * Parsea/valida un NetworkGraph NetJSON recibido de fuera (p.ej. la API de
 * OpenWISP `GET .../topology/{id}/`). Comprueba `type/protocol/version/metric`
 * y que `nodes`/`links` sean arrays con la forma mínima. Nunca lanza: ante
 * cualquier entrada inválida devuelve `null`.
 */
export function parseNetworkGraph(raw: unknown): NetJsonNetworkGraph | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const g = raw as Record<string, unknown>;
    if (g.type !== "NetworkGraph") return null;
    if (typeof g.protocol !== "string" || typeof g.version !== "string" || typeof g.metric !== "string") return null;
    if (!Array.isArray(g.nodes) || !Array.isArray(g.links)) return null;

    const nodes: NetJsonNode[] = [];
    for (const n of g.nodes) {
      if (n && typeof n === "object" && typeof (n as { id?: unknown }).id === "string") {
        nodes.push(n as NetJsonNode);
      }
    }
    const links: NetJsonLink[] = [];
    for (const l of g.links) {
      if (
        l &&
        typeof l === "object" &&
        typeof (l as { source?: unknown }).source === "string" &&
        typeof (l as { target?: unknown }).target === "string"
      ) {
        const raw_l = l as NetJsonLink;
        links.push({ ...raw_l, cost: Number.isFinite(raw_l.cost) ? raw_l.cost : 1 });
      }
    }

    const graph: NetJsonNetworkGraph = { type: "NetworkGraph", protocol: g.protocol, version: g.version, metric: g.metric, nodes, links };
    if (typeof g.label === "string") graph.label = g.label;
    return graph;
  } catch {
    return null;
  }
}

/**
 * Fusiona varios NetworkGraph en uno solo: nodos deduplicados por `id`
 * (los campos del último grafo que lo declare ganan) y enlaces deduplicados
 * por par `source→target` (último gana). Útil para combinar la topología
 * local (malla LoRa) con la topología reportada por OpenWISP. Nunca lanza.
 */
export function mergeGraphs(...graphs: Array<NetJsonNetworkGraph | null | undefined>): NetJsonNetworkGraph {
  const valid = graphs.filter((g): g is NetJsonNetworkGraph => !!g && Array.isArray(g.nodes) && Array.isArray(g.links));

  const nodesById = new Map<string, NetJsonNode>();
  const linksByKey = new Map<string, NetJsonLink>();
  const linkKey = (l: NetJsonLink) => `${l.source}→${l.target}`;

  for (const g of valid) {
    for (const n of g.nodes) {
      if (n && typeof n.id === "string" && n.id) nodesById.set(n.id, { ...nodesById.get(n.id), ...n });
    }
    for (const l of g.links) {
      if (l && typeof l.source === "string" && typeof l.target === "string") linksByKey.set(linkKey(l), l);
    }
  }

  const first = valid[0];
  const merged: NetJsonNetworkGraph = {
    type: "NetworkGraph",
    protocol: first?.protocol || "static",
    version: first?.version || "1",
    metric: first?.metric || "hop_count",
    nodes: Array.from(nodesById.values()),
    links: Array.from(linksByKey.values()),
  };
  const label = first?.label;
  if (label) merged.label = label;
  return merged;
}
