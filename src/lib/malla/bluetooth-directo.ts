/**
 * bluetooth-directo — el Bluetooth de la app nativa como ENLACE del transporte universal (2026-11-08 · BLE1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Contrato: `architecture/bluetooth-directo.md`.
 *
 * Petición de Alex: «el P2P sin router debe ir directo entre las antenas de los aparatos, no por una red
 * externa». La app nativa (macOS y Android) lleva ahora un portador Bluetooth de baja energía entre
 * neuronas (`native/src-tauri/src/ble*.rs`, `BleStarSeed.kt`): se anuncia con un UUID que rota y que solo
 * tu cuenta reconoce, conecta sola con tus neuronas cercanas y lleva tramas JSON con acuse. Aquí está lo
 * que lo convierte en un enlace más (`ble:<id>`, «Bluetooth directo»):
 *
 *   · LIGADURA por enlace: el mismo saludo firmado de la red local (`nl.hola` con la prueba de cuenta o
 *     el vínculo de MSH1107A, `aceptarHola` de `red-local-nativa.ts`). Sin saludo válido, nada.
 *   · LÍMITES: tramas de 16 KiB; archivos de hasta 20 MB en trozos de 10 KiB (a lo que dé el aire: se
 *     dice lo medido y, sin medida, «≈ 10–60 KB/s»); ni llamadas ni transmisiones en vivo.
 *   · SEÑALES: cada vecino oído por Bluetooth es una señal real del radar, con su RSSI.
 *   · CONTROL para el enlace Wi-Fi directo (WFD1108A): `enlace.wifi.oferta` / `enlace.wifi.respuesta`.
 */

import type { EnlaceDisponible } from "./eleccion-enlace";
import {
  CADA_HOLA_MS,
  ENTRE_HOLAS_MS,
  VIDA_LIGADURA_MS,
  trozoArchivoParaTrama,
  type LimitesCanal,
  type VinculoMinimo,
} from "./red-local-nativa";
import {
  ANTENNA_COLOR,
  ANTENNA_LABEL,
  placeByRf,
  placeBySector,
  qualityFromRssi,
  type DetectedSignal,
  type SignalMetric,
} from "@/ai/astraura/mesh/signals";
import { metrosPorRssi } from "@/ai/astraura/mesh/senales-radio-local";

export const PREFIJO_ENLACE_BLE = "ble:";
export const ETIQUETA_BLUETOOTH_DIRECTO = "Bluetooth directo";

/** Comandos y eventos de la app nativa (`native/src-tauri/src/ble.rs`). */
export const COMANDO_ESTADO_BLE = "ble_estado";
export const COMANDO_ABRIR_BLE = "ble_abrir";
export const COMANDO_CERRAR_BLE = "ble_cerrar";
export const COMANDO_ENVIAR_BLE = "ble_enviar";
export const COMANDO_RECIBIDOS_BLE = "ble_recibidos";
export const COMANDO_ACTIVAR_BLE = "ble_activar";
export const COMANDO_PERMISO_BLE = "ble_pedir_permiso";
export const EVENTO_MENSAJE_BLE = "ble://mensaje";
export const EVENTO_CAMBIO_BLE = "ble://cambio";

/** Tope de un archivo por Bluetooth (más grande, mejor por otro enlace: se dice el motivo). */
export const MAX_ARCHIVO_BLE = 20 * 1024 * 1024;
/** Por encima de esto un archivo prefiere cualquier enlace P2P más rápido (lo decide `eleccion-enlace.ts`). */
export { ARCHIVO_BLE_PREFERENTE_BYTES } from "./eleccion-enlace";
/** Lo que admite la app de esta versión (si la otra no dice nada en su saludo). */
export const LIMITES_BLE_DEFECTO: LimitesCanal = { maxCuerpo: 16 * 1024, porVentana: 120, ventanaMs: 10_000 };
/** Lo que suele dar el aire entre teléfono y ordenador SIN medir (solo para decir un orden de magnitud). */
export const KBPS_BLE_ORIENTATIVOS = { min: 80, max: 480 } as const;

/* ══════════════════════════ Lo que dice la app nativa (espejo de ble.rs) ══════════════════════════ */

export interface VecinoBleNativo {
  id: string;
  rssi: number;
  propia: boolean;
  neurona: string | null;
  tipo: string;
  servidor: boolean;
  visto_hace_ms: number;
  enlace: string | null;
}

export interface EnlaceBleNativo {
  id: string;
  rol: string;
  vecino: string | null;
  neurona: string | null;
  rssi: number | null;
  paquete: number;
  rtt_ms: number | null;
  kbps: number | null;
  pendientes: number;
  bytes_enviados: number;
  bytes_recibidos: number;
  abierto_hace_ms: number;
}

export interface EstadoBleNativo {
  disponible: boolean;
  activo: boolean;
  radio: string;
  motivo: string;
  plataforma: string;
  anunciando: boolean;
  con_cuenta: boolean;
  vecinos: VecinoBleNativo[];
  enlaces: EnlaceBleNativo[];
  ultimo_seq: number;
  max_cuerpo: number;
  limite_mensajes: number;
  limite_ventana_ms: number;
  paquete_max: number;
}

export interface MensajeBleNativo {
  seq: number;
  enlace: string;
  cuerpo: string;
  recibido_ms: number;
}

export interface EnvioBleNativo {
  enlace: string;
  ms: number;
}

const RE_ENLACE = /^b\d{1,9}$/;
const RE_VECINO = /^v[0-9a-f]{8}$/;

export function idEnlaceBle(enlace: string): string {
  return `${PREFIJO_ENLACE_BLE}${enlace}`;
}

/** «ble:b3» → «b3» (o null si no es un enlace Bluetooth). */
export function enlaceDeIdBle(id: string | null | undefined): string | null {
  if (!id || !id.startsWith(PREFIJO_ENLACE_BLE)) return null;
  const e = id.slice(PREFIJO_ENLACE_BLE.length);
  return RE_ENLACE.test(e) ? e : null;
}

export function esEnlaceBle(id: string | null | undefined): boolean {
  return enlaceDeIdBle(id) !== null;
}

function num(x: unknown, d = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : d;
}

function numONull(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function txt(x: unknown, max = 300): string {
  return typeof x === "string" ? x.slice(0, max) : "";
}

function txtONull(x: unknown, max = 80): string | null {
  return typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null;
}

/** Lo que llega de `ble_estado` / `ble://cambio`, saneado (lo raro se descarta, nunca se inventa). */
export function leerEstadoBle(x: unknown): EstadoBleNativo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.disponible !== "boolean" || typeof o.radio !== "string") return null;
  const vecinos: VecinoBleNativo[] = (Array.isArray(o.vecinos) ? o.vecinos : [])
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" && RE_VECINO.test((v as { id: string }).id))
    .slice(0, 64)
    .map((v) => ({
      id: v.id as string,
      rssi: Math.max(-127, Math.min(20, Math.round(num(v.rssi, -127)))),
      propia: v.propia === true,
      neurona: txtONull(v.neurona),
      tipo: txt(v.tipo, 20) || "desconocido",
      servidor: v.servidor === true,
      visto_hace_ms: Math.max(0, num(v.visto_hace_ms)),
      enlace: typeof v.enlace === "string" && RE_ENLACE.test(v.enlace) ? v.enlace : null,
    }));
  const enlaces: EnlaceBleNativo[] = (Array.isArray(o.enlaces) ? o.enlaces : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && RE_ENLACE.test((e as { id: string }).id))
    .slice(0, 16)
    .map((e) => ({
      id: e.id as string,
      rol: e.rol === "central" ? "central" : "periferico",
      vecino: typeof e.vecino === "string" && RE_VECINO.test(e.vecino) ? e.vecino : null,
      neurona: txtONull(e.neurona),
      rssi: numONull(e.rssi),
      paquete: num(e.paquete, 20),
      rtt_ms: numONull(e.rtt_ms),
      kbps: numONull(e.kbps),
      pendientes: num(e.pendientes),
      bytes_enviados: num(e.bytes_enviados),
      bytes_recibidos: num(e.bytes_recibidos),
      abierto_hace_ms: num(e.abierto_hace_ms),
    }));
  return {
    disponible: o.disponible,
    activo: o.activo !== false,
    radio: txt(o.radio, 20),
    motivo: txt(o.motivo),
    plataforma: txt(o.plataforma, 20),
    anunciando: o.anunciando === true,
    con_cuenta: o.con_cuenta === true,
    vecinos,
    enlaces,
    ultimo_seq: num(o.ultimo_seq),
    max_cuerpo: num(o.max_cuerpo, LIMITES_BLE_DEFECTO.maxCuerpo),
    limite_mensajes: num(o.limite_mensajes, LIMITES_BLE_DEFECTO.porVentana),
    limite_ventana_ms: num(o.limite_ventana_ms, LIMITES_BLE_DEFECTO.ventanaMs),
    paquete_max: num(o.paquete_max, 512),
  };
}

/** Los límites que la app de ESTE aparato anuncia en su saludo. */
export function limitesPropiosBle(e: EstadoBleNativo | null): LimitesCanal {
  if (!e) return { ...LIMITES_BLE_DEFECTO };
  return {
    maxCuerpo: Math.min(Math.max(e.max_cuerpo, 4 * 1024), 64 * 1024),
    porVentana: Math.min(Math.max(1, e.limite_mensajes), 1000),
    ventanaMs: Math.min(Math.max(1000, e.limite_ventana_ms), 60_000),
  };
}

/** Bytes crudos de un trozo de archivo que caben (en base64) en una trama Bluetooth: 10 KiB con 16 KiB. */
export function trozoArchivoBle(l: LimitesCanal = LIMITES_BLE_DEFECTO): number {
  return trozoArchivoParaTrama(l);
}

/* ══════════════════════════ Ligaduras por enlace ══════════════════════════ */

/** Un enlace Bluetooth que ya dijo, firmando, quién es (como `Ligadura` de la red local, por enlace). */
export interface LigaduraBle {
  enlace: string;
  neurona: string;
  huella: string;
  nombre: string;
  sync?: string;
  cuenta?: string;
  limites: LimitesCanal;
  /** Último saludo verificado (epoch ms). */
  at: number;
  porCuenta?: boolean;
  /** (CIF1108A) Versión de cifrado que anunció en su saludo firmado (ausente: app anterior, sin cifrar). */
  cif?: number;
}

export function vigenteBle(l: LigaduraBle, ahora: number): boolean {
  return ahora - l.at <= VIDA_LIGADURA_MS;
}

/** Un enlace es de UNA neurona y una neurona está en UN enlace (gana la última). */
export function ligarBle(lista: readonly LigaduraBle[], l: LigaduraBle): LigaduraBle[] {
  return [l, ...lista.filter((x) => x.enlace !== l.enlace && x.neurona !== l.neurona)];
}

export function ligaduraDeEnlace(lista: readonly LigaduraBle[], enlace: string, ahora: number): LigaduraBle | null {
  return lista.find((l) => l.enlace === enlace && vigenteBle(l, ahora)) ?? null;
}

export function ligaduraDeNeuronaBle(lista: readonly LigaduraBle[], neurona: string, ahora: number): LigaduraBle | null {
  return lista.find((l) => l.neurona === neurona && vigenteBle(l, ahora)) ?? null;
}

/** Quita las caducadas y las de enlaces que ya no están abiertos. */
export function podarLigadurasBle(lista: readonly LigaduraBle[], abiertos: ReadonlySet<string>, ahora: number): LigaduraBle[] {
  return lista.filter((l) => vigenteBle(l, ahora) && abiertos.has(l.enlace));
}

/** Cuántas neuronas se prueban como mucho por enlace sin reconocer (un saludo firmado ocupa ~1 KiB). */
export const MAX_SALUDOS_A_CIEGAS = 6;

/**
 * saludosBle — a quién saludar ahora y por qué enlace. En un enlace que ESTE aparato abrió por el anuncio,
 * a la neurona que el anuncio reconoció; en uno sin reconocer (el otro conectó, o el anuncio no decía
 * cuál), a las neuronas de la cuenta y vinculadas que aún no están ligadas (≤ 6): solo la de verdad lo
 * acepta. Nunca a uno ligado hace < 2 min ni al mismo enlace dos veces en 30 s. Puro.
 */
export function saludosBle(p: {
  enlaces: readonly EnlaceBleNativo[];
  ligaduras: readonly LigaduraBle[];
  vinculos: readonly VinculoMinimo[];
  /** Ids de las neuronas de TU cuenta que conoce esta web (para enlaces sin reconocer). */
  cuenta: readonly string[];
  /** Esta app tiene la clave de faro: su saludo lleva la prueba de cuenta. */
  conClave: boolean;
  yo: string;
  ultimoHola: Readonly<Record<string, number>>;
  ahora: number;
}): Array<{ enlace: string; para: string }> {
  const out: Array<{ enlace: string; para: string }> = [];
  const vinculadas = new Set(p.vinculos.map((v) => v.neurona));
  const confiable = (n: string) => n !== p.yo && (vinculadas.has(n) || p.conClave);
  for (const e of p.enlaces) {
    const lig = ligaduraDeEnlace(p.ligaduras, e.id, p.ahora);
    if (lig && p.ahora - lig.at < CADA_HOLA_MS) continue;
    if (p.ahora - (p.ultimoHola[e.id] ?? -Infinity) < ENTRE_HOLAS_MS) continue;
    let para: string[];
    if (lig) para = [lig.neurona];
    else if (e.neurona) para = [e.neurona];
    else {
      const ligadas = new Set(p.ligaduras.filter((l) => vigenteBle(l, p.ahora)).map((l) => l.neurona));
      para = Array.from(new Set([...p.vinculos.map((v) => v.neurona), ...(p.conClave ? p.cuenta : [])])).filter((n) => !ligadas.has(n));
    }
    for (const n of para.filter(confiable).slice(0, MAX_SALUDOS_A_CIEGAS)) out.push({ enlace: e.id, para: n });
  }
  return out;
}

/* ══════════════════════════ Enlaces para el transporte universal ══════════════════════════ */

/**
 * enlacesBle — un `EnlaceDisponible` de tipo `ble` por enlace abierto y ligado. Abierto si su app no está
 * caída (fallos seguidos). Latencia y capacidad: lo MEDIDO por Rust (ida y vuelta del último mensaje
 * acusado y rendimiento del último de ≥ 2 KiB); sin medida, null («sin medir»). Puro.
 */
export function enlacesBle(p: {
  estado: EstadoBleNativo | null;
  ligaduras: readonly LigaduraBle[];
  ahora: number;
  caidas: Readonly<Record<string, number>>;
  /** (CIF1108A) Estado del cifrado por enlace («b3»); ausente: no se dice. */
  cifrado?: Readonly<Record<string, "cifrado" | "sin-cifrar" | "pendiente">>;
}): EnlaceDisponible[] {
  const e = p.estado;
  if (!e || !e.activo || e.radio !== "encendida") return [];
  const out: EnlaceDisponible[] = [];
  for (const l of e.enlaces) {
    const lig = ligaduraDeEnlace(p.ligaduras, l.id, p.ahora);
    if (!lig) continue;
    out.push({
      id: idEnlaceBle(l.id),
      tipo: "ble",
      etiqueta: `${lig.nombre} · Bluetooth`,
      alcanza: { neuronDeviceId: lig.neurona, ...(lig.sync ? { syncDeviceId: lig.sync } : {}), ...(lig.cuenta ? { uid: lig.cuenta } : {}) },
      abierto: !((p.caidas[l.id] ?? 0) > p.ahora),
      sinInternet: true,
      ruta: null,
      rttMs: l.rtt_ms,
      capacidadKbps: l.kbps,
      maxBytes: MAX_ARCHIVO_BLE,
      admite: { mensaje: true, archivo: true, flujo: false },
      consentido: true,
      ...(p.cifrado?.[l.id] ? { cifrado: p.cifrado[l.id] } : {}),
    });
  }
  return out;
}

/** «≈ 24 KB/s (medido)» o «sin medir (por Bluetooth suele ir a 10–60 KB/s)». Puro. */
export function textoVelocidadBle(kbps: number | null | undefined): string {
  if (typeof kbps === "number" && Number.isFinite(kbps) && kbps > 0) {
    const kBs = kbps / 8;
    return `≈ ${kBs >= 10 ? Math.round(kBs) : Math.round(kBs * 10) / 10} KB/s (medido)`;
  }
  return `sin medir (por Bluetooth suele ir a ${KBPS_BLE_ORIENTATIVOS.min / 8}–${KBPS_BLE_ORIENTATIVOS.max / 8} KB/s)`;
}

/** Cuánto tardaría un archivo por Bluetooth: con la medida, una cifra; sin ella, una horquilla. Puro. */
export function duracionArchivoBle(bytes: number, kbps: number | null | undefined): string {
  const fmt = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 360) / 10} h`);
  if (typeof kbps === "number" && Number.isFinite(kbps) && kbps > 0) return `≈ ${fmt((bytes * 8) / (kbps * 1000))}`;
  const lento = (bytes * 8) / (KBPS_BLE_ORIENTATIVOS.min * 1000);
  const rapido = (bytes * 8) / (KBPS_BLE_ORIENTATIVOS.max * 1000);
  return `entre ${fmt(rapido)} y ${fmt(lento)} (sin medir)`;
}

/* ══════════════════════════ Señales del radar ══════════════════════════ */

/**
 * senalesBluetoothDirecto — cada aparato StarSeed que la app oye por Bluetooth es una señal REAL del radar
 * (antena «ble»): su RSSI medido, la distancia estimada por él (log-distancia, ±50 %), de quién es solo si
 * el anuncio lo deja comprobar con la clave de faro de tu cuenta, y si hay enlace abierto. Puro.
 */
export function senalesBluetoothDirecto(
  estado: EstadoBleNativo | null,
  ahora: number,
  nombres: ReadonlyMap<string, string> = new Map(),
): DetectedSignal[] {
  if (!estado || !estado.activo || estado.radio !== "encendida") return [];
  return estado.vecinos.map((v) => {
    const id = `ble-directo:${v.id}`;
    const q = qualityFromRssi(v.rssi);
    const nombre = v.neurona ? nombres.get(v.neurona) ?? null : null;
    const enlace = v.enlace ? estado.enlaces.find((e) => e.id === v.enlace) ?? null : null;
    const metricas: SignalMetric[] = [
      { label: "Señal", value: `${v.rssi} dBm` },
      { label: "Último anuncio", value: `hace ${Math.round(v.visto_hace_ms / 1000)} s` },
      { label: "Tipo de aparato", value: v.tipo },
      { label: "Enlace", value: enlace ? `abierto (${enlace.rtt_ms != null ? `${enlace.rtt_ms} ms` : "sin medir"} · ${textoVelocidadBle(enlace.kbps)})` : v.servidor ? "sin abrir (acepta conexiones)" : "sin abrir (no acepta conexiones ahora)" },
    ];
    const metros = v.rssi > -127 ? metrosPorRssi(v.rssi, "bt") : null;
    const placement =
      metros === null
        ? placeBySector("ble", id, q)
        : {
            ...placeByRf("ble", id, metros, q),
            detail: `Distancia ESTIMADA por RSSI (${v.rssi} dBm, modelo log-distancia): unos ${metros} m ±50 %. El rumbo es desconocido: se sitúa en el sector de su antena.`,
          };
    const senal: DetectedSignal = {
      id,
      antenna: "ble",
      antennaLabel: ANTENNA_LABEL.ble,
      signalType: "Bluetooth directo · neurona StarSeed (app nativa)",
      label: nombre ?? (v.propia ? (v.neurona ? "Neurona de tu cuenta (Bluetooth)" : "Neurona de tu cuenta, sin identificar (Bluetooth)") : "Neurona StarSeed cercana (Bluetooth)"),
      detail: v.propia
        ? "La app nativa oye su anuncio Bluetooth: es de tu cuenta (lo comprueba la clave de faro). Habla con ella sin Wi-Fi ni internet."
        : "La app nativa oye un anuncio StarSeed por Bluetooth que no es de tu cuenta: solo se ve. Sin vínculo, no se habla.",
      quality: q,
      qualityDetail: `Señal ${v.rssi} dBm (−110 al límite · −40 pegado).`,
      metrics: metricas,
      compatible: v.propia,
      compatDetail: v.propia
        ? "Bluetooth directo: mensajes y archivos (≤ 20 MB) entre las dos apps nativas, sin router."
        : "De otra cuenta: se ve, no se usa.",
      starseed: v.propia
        ? {
            via: "direct-link",
            sourceId: id,
            ...(v.neurona ? { neuronId: v.neurona } : {}),
            name: nombre,
            ownAccount: true,
            capabilities: ["Bluetooth directo"],
            lastSeenMs: ahora - v.visto_hace_ms,
          }
        : null,
      placement,
      lastHeard: ahora - v.visto_hace_ms,
      actions: [],
      simulated: false,
      color: ANTENNA_COLOR.ble,
    };
    return senal;
  });
}

/* ══════════════════════════ Control del enlace Wi-Fi directo (para WFD1108A) ══════════════════════════ */

export const T_OFERTA_WIFI = "enlace.wifi.oferta";
export const T_RESPUESTA_WIFI = "enlace.wifi.respuesta";

/** Contraseña (u otro secreto) cifrada con AES-GCM 256 (`cifrarSecretoEnlace` del motor). */
export interface SecretoCifrado {
  /** 12 bytes en base64. */
  iv: string;
  /** Texto cifrado + etiqueta, en base64. */
  ct: string;
}

/**
 * Oferta de un enlace Wi-Fi directo (punto de acceso local de Android o Wi-Fi Direct) negociada por el
 * Bluetooth directo. Va dentro de un sobre FIRMADO con la identidad de malla; solo se acepta de la neurona
 * ligada a ese enlace con la misma huella, y el secreto solo lo descifra quien tiene la clave de faro de la
 * cuenta.
 */
export interface OfertaEnlaceWifi {
  t: "enlace.wifi.oferta";
  v: 1;
  /** Sesión (aleatoria): ata oferta, respuesta y secreto. */
  s: string;
  de: string;
  para: string;
  modo: "hotspot" | "wifi-direct";
  ssid: string;
  banda?: "2.4" | "5" | "6";
  /** IP del que ofrece dentro de esa red, si ya la sabe. */
  ip?: string;
  /** Puerto del canal local (por defecto 47071). */
  puerto?: number;
  secreto?: SecretoCifrado;
  /** Hasta cuándo vale (epoch ms; ≤ 10 min). */
  caduca: number;
  ts: number;
}

export interface RespuestaEnlaceWifi {
  t: "enlace.wifi.respuesta";
  v: 1;
  s: string;
  de: string;
  para: string;
  /** acepto: se intenta unir · rechazo: no · unido: ya está en la red (con su IP) · fallo: no pudo. */
  k: "acepto" | "rechazo" | "unido" | "fallo";
  ip?: string;
  motivo?: string;
  ts: number;
}

export type ControlEnlaceWifi = OfertaEnlaceWifi | RespuestaEnlaceWifi;

const RE_B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const RE_SESION = /^[A-Za-z0-9_-]{8,64}$/;
const RE_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
/** Una oferta no vale más de esto (ni con un reloj adelantado). */
export const VIDA_OFERTA_WIFI_MS = 10 * 60_000;

function ipPrivada(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const m = RE_IPV4.exec(x.trim());
  if (!m) return undefined;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return undefined;
  const [a, b] = o;
  const ok = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  return ok ? o.join(".") : undefined;
}

/**
 * leerControlEnlace — el cuerpo (ya verificado) de una oferta o respuesta, saneado. Null si no es de este
 * protocolo, si caducó (`ahora`) o si trae algo raro. Puro.
 */
export function leerControlEnlace(x: unknown, ahora: number): ControlEnlaceWifi | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1 || typeof o.s !== "string" || !RE_SESION.test(o.s)) return null;
  const de = txtONull(o.de);
  const para = txtONull(o.para);
  const ts = numONull(o.ts);
  if (!de || !para || ts === null || ts > ahora + 60_000 || ahora - ts > VIDA_OFERTA_WIFI_MS) return null;
  if (o.t === T_OFERTA_WIFI) {
    const ssid = typeof o.ssid === "string" ? o.ssid.slice(0, 32) : "";
    const caduca = numONull(o.caduca);
    if (!ssid || caduca === null || caduca < ahora || caduca > ahora + VIDA_OFERTA_WIFI_MS + 60_000) return null;
    if (o.modo !== "hotspot" && o.modo !== "wifi-direct") return null;
    const sec = o.secreto as Record<string, unknown> | undefined;
    const secreto =
      sec && typeof sec.iv === "string" && typeof sec.ct === "string" && RE_B64.test(sec.iv) && RE_B64.test(sec.ct) && sec.ct.length <= 512
        ? { iv: sec.iv, ct: sec.ct }
        : undefined;
    const ip = ipPrivada(o.ip);
    const puerto = typeof o.puerto === "number" && Number.isInteger(o.puerto) && o.puerto >= 1024 && o.puerto <= 65535 ? o.puerto : undefined;
    return {
      t: T_OFERTA_WIFI,
      v: 1,
      s: o.s,
      de,
      para,
      modo: o.modo,
      ssid,
      ...(o.banda === "2.4" || o.banda === "5" || o.banda === "6" ? { banda: o.banda } : {}),
      ...(ip ? { ip } : {}),
      ...(puerto ? { puerto } : {}),
      ...(secreto ? { secreto } : {}),
      caduca,
      ts,
    };
  }
  if (o.t === T_RESPUESTA_WIFI) {
    if (o.k !== "acepto" && o.k !== "rechazo" && o.k !== "unido" && o.k !== "fallo") return null;
    const ip = ipPrivada(o.ip);
    const motivo = txtONull(o.motivo, 300);
    return { t: T_RESPUESTA_WIFI, v: 1, s: o.s, de, para, k: o.k, ...(ip ? { ip } : {}), ...(motivo ? { motivo } : {}), ts };
  }
  return null;
}

/** Texto con el que se deriva la clave del secreto (HMAC-SHA256 con la clave de faro de la cuenta). */
export function textoClaveSecreto(sesion: string): string {
  return `ss-enlace-wifi-v1|${sesion}`;
}

/** Datos asociados del AES-GCM: ata el secreto a quién lo manda, a quién y a la sesión. */
export function datosAsociadosSecreto(p: { de: string; para: string; s: string }): string {
  return `${p.de}|${p.para}|${p.s}`;
}
