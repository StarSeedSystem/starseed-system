/**
 * enlace-wifi-directo — protocolo PURO para abrir un enlace Wi-Fi directo entre dos neuronas, sin router (2026-11-08 · WFD1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Contrato: `architecture/wifi-directo.md`.
 *
 * Alex: «P2P sin router debe ser directo entre las antenas de los aparatos, no por una red externa».
 * Para lo pesado (archivos grandes, llamadas, pantalla, transmisiones) dos neuronas abren SOLAS una red
 * Wi-Fi propia entre ellas; después el transporte local de siempre (canal TCP 47071 + WebRTC señalizado
 * por él) corre encima sin cambios.
 *
 * NEGOCIACIÓN — cuatro mensajes de control que viajan por CUALQUIER enlace que ya llegue a esa neurona
 * (Bluetooth LE si lo hay, el canal local nativo, la malla de la cuenta o el relé cifrado):
 *   1 · `enlace.wifi.oferta`    (quien necesita el ancho → la otra): sus capacidades y su clave pública
 *                               de cifrado (ECDH P-256 de la identidad de malla). Nada secreto.
 *   2 · `enlace.wifi.respuesta` (la otra → quien ofreció): acepta o no (con el motivo), sus capacidades,
 *                               su clave pública y los ROLES que salen de `elegirRoles` (quién hace de
 *                               punto de acceso y con qué método; Android primero).
 *   3 · `enlace.wifi.listo`     fase «red»: el punto de acceso ya emite y manda SSID, contraseña, banda,
 *                               IP y puerto CIFRADOS para la clave pública del otro (ECDH→HKDF→AES-GCM,
 *                               `recipient-crypto.ts`): ni el relé ni nadie en medio los lee.
 *                               fase «unida»: el cliente ya está en esa red y dice su IP en ella.
 *   4 · `enlace.wifi.cierre`    cualquiera, en cualquier momento: se cierra y cada uno vuelve a lo suyo.
 * Cada mensaje viaja FIRMADO con la identidad de malla (sobre v2 con instante y nonce): en el cable es
 * `{"t":"enlace.wifi.<tipo>","s":<sobre>}` y el `t` de fuera tiene que ser el de dentro.
 *
 * La MÁQUINA DE ESTADOS (`pasoWifi`) es determinista: recibe eventos (mensajes ya verificados y
 * descifrados, lo que dice la parte nativa, el reloj) y devuelve el estado nuevo y las acciones que el
 * motor ejecuta (`enlace-wifi-motor.ts`). Cada fase tiene su plazo; si vence, se cierra y se sigue por el
 * enlace lento de antes («respaldo»), diciendo por qué.
 */

/* ══════════════════════════ Constantes ══════════════════════════ */

export const PREFIJO_MENSAJE_WIFI = "enlace.wifi.";
/** Canal de aplicación del transporte universal por el que viaja el control. */
export const CANAL_CONTROL_WIFI = "enlace-wifi";
export const VERSION_PROTOCOLO_WIFI = 1;
/** El canal TCP de la app nativa (malla_local.rs): corre igual sobre la red nueva. */
export const PUERTO_CANAL_WIFI = 47071;

export const TIPOS_WIFI = ["enlace.wifi.oferta", "enlace.wifi.respuesta", "enlace.wifi.listo", "enlace.wifi.cierre"] as const;
export type TipoMensajeWifi = (typeof TIPOS_WIFI)[number];

/** Plazos de cada fase (ms). Si vence, se cierra y se sigue por el enlace de antes. */
export const PLAZOS_WIFI = {
  /** Quien ofrece espera la respuesta. */
  respuesta: 15_000,
  /** La otra neurona, con «Preguntar», espera a que la persona decida. */
  persona: 45_000,
  /** El punto de acceso tarda en levantarse (Android: 2–8 s). */
  abrirRed: 30_000,
  /** El cliente espera las credenciales (el otro levanta su red). */
  esperarRed: 45_000,
  /** El cliente se une (el Mac puede tardar más: escanea y asocia; con la vía guiada, la persona). */
  unirse: 60_000,
  /** Guiado: la persona se une a mano desde el menú Wi-Fi. */
  unirseGuiado: 180_000,
  /** El punto de acceso espera a que el cliente diga que está dentro. */
  esperarUnion: 75_000,
} as const;

/**
 * Sin tráfico en este tiempo, quien pidió el enlace lo cierra (el Mac vuelve a su red). La otra neurona
 * solo lo cierra sola pasado el triple (si quien lo pidió desapareció sin cerrarlo).
 */
export const INACTIVIDAD_WIFI_MS = 5 * 60_000;

/** Prefijo del SSID cuando el punto de acceso lo elige la app (Wi-Fi Direct exige «DIRECT-xy-»). */
export const PREFIJO_SSID = "StarSeed-";

/* ══════════════════════════ Capacidades ══════════════════════════ */

export type PlataformaWifi = "android" | "macos" | "ios" | "windows" | "linux" | "navegador" | "desconocida";
/** Cómo levanta la red quien hace de punto de acceso. */
export type MetodoAp = "hotspot-local" | "wifi-direct";
/** Cómo entra en ella quien hace de cliente. */
export type MetodoCliente = "wifi-direct" | "corewlan" | "guiado";
export type EstadoPermisoWifi = "concedido" | "preguntar" | "denegado" | "no-aplica";
export type BandaWifi = "2.4" | "5" | "6";

export interface CapacidadesWifi {
  plataforma: PlataformaWifi;
  /** Métodos con los que puede hacer de punto de acceso (en orden de preferencia propia). */
  ap: MetodoAp[];
  /** Métodos con los que puede unirse a la red del otro. */
  cliente: MetodoCliente[];
  /** Permiso del sistema para crear o unirse a redes («Dispositivos cercanos», «Ubicación»…). */
  permiso: EstadoPermisoWifi;
  /** Unirse a otra red deja la red Wi-Fi actual (una sola radio: el Mac). */
  radioUnica: boolean;
  /** Wi-Fi encendido ahora. */
  wifi: boolean;
}

const PLATAFORMAS: readonly PlataformaWifi[] = ["android", "macos", "ios", "windows", "linux", "navegador", "desconocida"];
const METODOS_AP: readonly MetodoAp[] = ["hotspot-local", "wifi-direct"];
const METODOS_CLIENTE: readonly MetodoCliente[] = ["wifi-direct", "corewlan", "guiado"];
const PERMISOS: readonly EstadoPermisoWifi[] = ["concedido", "preguntar", "denegado", "no-aplica"];

/** Lo que puede una app sin parte nativa (navegador) o anterior a WFD1108A: nada. */
export const SIN_CAPACIDADES: CapacidadesWifi = { plataforma: "navegador", ap: [], cliente: [], permiso: "no-aplica", radioUnica: false, wifi: false };

function unicos<T>(xs: unknown, validos: readonly T[]): T[] {
  if (!Array.isArray(xs)) return [];
  const out: T[] = [];
  for (const x of xs) if (validos.includes(x as T) && !out.includes(x as T)) out.push(x as T);
  return out;
}

/** Lee unas capacidades (de la red o de la parte nativa). Lo que no se entiende, fuera. Puro. */
export function leerCapacidades(x: unknown): CapacidadesWifi | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const plataforma = PLATAFORMAS.includes(o.plataforma as PlataformaWifi) ? (o.plataforma as PlataformaWifi) : "desconocida";
  return {
    plataforma,
    ap: unicos<MetodoAp>(o.ap, METODOS_AP),
    cliente: unicos<MetodoCliente>(o.cliente, METODOS_CLIENTE),
    permiso: PERMISOS.includes(o.permiso as EstadoPermisoWifi) ? (o.permiso as EstadoPermisoWifi) : "no-aplica",
    radioUnica: o.radioUnica === true || o.radio_unica === true,
    wifi: o.wifi === true,
  };
}

/** ¿Puede esta app tomar parte en un enlace Wi-Fi directo (de punto de acceso o de cliente)? */
export function puedeEnlaceWifi(c: CapacidadesWifi | null | undefined): boolean {
  return !!c && c.permiso !== "denegado" && (c.ap.length > 0 || c.cliente.length > 0);
}

/* ══════════════════════════ Roles ══════════════════════════ */

export interface RolesWifi {
  /** Neurona que hace de punto de acceso. */
  ap: string;
  /** Neurona que se une. */
  cliente: string;
  metodoAp: MetodoAp;
  metodoCliente: MetodoCliente;
}

/** ¿Un cliente con `mc` entra en una red levantada con `ma`? */
export function compatibles(ma: MetodoAp, mc: MetodoCliente): boolean {
  // Un grupo Wi-Fi Direct es una red WPA2 normal: un Mac (o una persona) entra como en cualquier red.
  // Un Android solo entra SIN preguntar en un grupo Wi-Fi Direct (con sus credenciales, Android 10+);
  // en una red cualquiera Android pediría confirmación a la persona: no vale para «sin unirse a mano».
  if (mc === "wifi-direct") return ma === "wifi-direct";
  return true;
}

/** Puntos de cada combinación (más = mejor). Ver la cabecera del contrato §3. */
export function puntosCombinacion(apCap: CapacidadesWifi, ma: MetodoAp, cliCap: CapacidadesWifi, mc: MetodoCliente): number {
  let p = 0;
  if (apCap.plataforma === "android") p += 100; // Android levanta la red: el Mac no puede (sin Wi-Fi Direct ni API de punto de acceso).
  if (ma === "wifi-direct" && mc === "wifi-direct") p += 50; // las dos conservan su Wi-Fi de casa
  else if (ma === "hotspot-local" && mc === "corewlan") p += 40; // Android ↔ Mac, lo pedido
  else if (ma === "wifi-direct" && mc === "corewlan") p += 30; // respaldo si el punto de acceso local no está
  else if (ma === "hotspot-local" && mc === "guiado") p += 20;
  else if (ma === "wifi-direct" && mc === "guiado") p += 10;
  if (cliCap.radioUnica) p -= 20; // mejor de cliente quien no pierde su red
  if (apCap.permiso === "preguntar") p -= 3;
  if (cliCap.permiso === "preguntar") p -= 3;
  return p;
}

function apta(c: CapacidadesWifi): boolean {
  return c.wifi && c.permiso !== "denegado";
}

/**
 * elegirRoles — quién hace de punto de acceso, con qué método, y cómo se une el otro. Las dos neuronas
 * lo calculan igual (determinista: a igualdad de puntos, punto de acceso la de id menor). Null si no hay
 * combinación posible (dos Mac, Wi-Fi apagado, permiso denegado…): se sigue por el enlace de antes. Puro.
 */
export function elegirRoles(
  a: { neurona: string; cap: CapacidadesWifi },
  b: { neurona: string; cap: CapacidadesWifi },
): RolesWifi | null {
  if (!a.neurona || !b.neurona || a.neurona === b.neurona) return null;
  let mejor: { roles: RolesWifi; puntos: number } | null = null;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!apta(x.cap) || !apta(y.cap)) continue;
    for (const ma of x.cap.ap) {
      for (const mc of y.cap.cliente) {
        if (!compatibles(ma, mc)) continue;
        const puntos = puntosCombinacion(x.cap, ma, y.cap, mc);
        const roles: RolesWifi = { ap: x.neurona, cliente: y.neurona, metodoAp: ma, metodoCliente: mc };
        if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && x.neurona < mejor.roles.ap)) mejor = { roles, puntos };
      }
    }
  }
  return mejor?.roles ?? null;
}

/** ¿Estos roles valen con estas capacidades? (quien ofreció comprueba lo que eligió el otro). Puro. */
export function rolesValidos(r: RolesWifi | null | undefined, a: { neurona: string; cap: CapacidadesWifi }, b: { neurona: string; cap: CapacidadesWifi }): boolean {
  if (!r) return false;
  const par = r.ap === a.neurona && r.cliente === b.neurona ? [a, b] : r.ap === b.neurona && r.cliente === a.neurona ? [b, a] : null;
  if (!par) return false;
  const [x, y] = par;
  return apta(x.cap) && apta(y.cap) && x.cap.ap.includes(r.metodoAp) && y.cap.cliente.includes(r.metodoCliente) && compatibles(r.metodoAp, r.metodoCliente);
}

export function leerRoles(x: unknown): RolesWifi | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.ap !== "string" || typeof o.cliente !== "string" || !o.ap || !o.cliente || o.ap === o.cliente) return null;
  if (!METODOS_AP.includes(o.metodoAp as MetodoAp) || !METODOS_CLIENTE.includes(o.metodoCliente as MetodoCliente)) return null;
  return { ap: o.ap.slice(0, 80), cliente: o.cliente.slice(0, 80), metodoAp: o.metodoAp as MetodoAp, metodoCliente: o.metodoCliente as MetodoCliente };
}

/* ══════════════════════════ Credenciales ══════════════════════════ */

/** Lo que el punto de acceso pasa al cliente (SIEMPRE cifrado; nunca en estado ni en registros). */
export interface CredencialesWifi {
  ssid: string;
  clave: string;
  banda: BandaWifi | null;
  /** IP del punto de acceso en la red nueva (null si su sistema no la dice: el faro la encuentra). */
  ipAp: string | null;
  puerto: number;
  metodo: MetodoAp;
  /** Epoch ms tras el que no vale (la red se cierra antes o a la vez). */
  caduca: number;
}

const RE_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** IPv4 privada o de enlace local (la red nueva siempre lo es). Espejo de `ipLocal`. */
export function ipPrivada(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = RE_IPV4.exec(x.trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  const [a, b] = o;
  const ok = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  return ok ? o.join(".") : null;
}

/** SSID de 1 a 32 bytes sin caracteres de control. Espejo de `ssid_valido` (Rust). */
export function ssidValido(s: unknown): s is string {
  if (typeof s !== "string" || !s.length) return false;
  if (/[\u0000-\u001f\u007f]/.test(s)) return false;
  return new TextEncoder().encode(s).length <= 32;
}

/** Contraseña WPA2: 8 a 63 caracteres ASCII imprimibles. Espejo de `clave_valida` (Rust). */
export function claveValida(s: unknown): s is string {
  return typeof s === "string" && s.length >= 8 && s.length <= 63 && /^[\x20-\x7e]+$/.test(s);
}

/** Lee y valida unas credenciales recién descifradas. Null si algo no cuadra (no se intenta unir). Puro. */
export function leerCredenciales(x: unknown, ahora: number): CredencialesWifi | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!ssidValido(o.ssid) || !claveValida(o.clave)) return null;
  if (!METODOS_AP.includes(o.metodo as MetodoAp)) return null;
  const caduca = typeof o.caduca === "number" && Number.isFinite(o.caduca) ? o.caduca : 0;
  if (caduca <= ahora) return null;
  const puerto = typeof o.puerto === "number" && o.puerto >= 1024 && o.puerto <= 65535 ? Math.floor(o.puerto) : PUERTO_CANAL_WIFI;
  const banda = o.banda === "2.4" || o.banda === "5" || o.banda === "6" ? o.banda : null;
  return { ssid: o.ssid, clave: o.clave, banda, ipAp: ipPrivada(o.ipAp), puerto, metodo: o.metodo as MetodoAp, caduca };
}

/** La red sin la contraseña (lo único que se guarda en el estado y se enseña). */
export interface RedWifiPublica {
  ssid: string;
  banda: BandaWifi | null;
  ipAp: string | null;
  metodo: MetodoAp;
}

export function redPublica(c: Pick<CredencialesWifi, "ssid" | "banda" | "ipAp" | "metodo">): RedWifiPublica {
  return { ssid: c.ssid, banda: c.banda, ipAp: c.ipAp, metodo: c.metodo };
}

/* ══════════════════════════ Mensajes ══════════════════════════ */

/** Para qué hace falta el ancho (lo dice la oferta; la otra neurona lo enseña si pregunta). */
export type ClaseNecesidad = "archivo" | "llamada" | "pantalla" | "flujo" | "manual";
const CLASES: readonly ClaseNecesidad[] = ["archivo", "llamada", "pantalla", "flujo", "manual"];

export type MotivoRechazo = "nunca" | "persona" | "sin-capacidad" | "ocupada" | "sin-confianza" | "version";
export type MotivoCierre =
  | "persona"
  | "inactivo"
  | "plazo"
  | "permiso-denegado"
  | "sin-soporte"
  | "fallo-nativo"
  | "no-encontrada"
  | "credenciales"
  | "roles"
  | "rechazo"
  | "sustituida";

const MOTIVOS_RECHAZO: readonly MotivoRechazo[] = ["nunca", "persona", "sin-capacidad", "ocupada", "sin-confianza", "version"];
const MOTIVOS_CIERRE: readonly MotivoCierre[] = [
  "persona",
  "inactivo",
  "plazo",
  "permiso-denegado",
  "sin-soporte",
  "fallo-nativo",
  "no-encontrada",
  "credenciales",
  "roles",
  "rechazo",
  "sustituida",
];

interface BaseWifi {
  v: 1;
  sesion: string;
  /** Neurona que lo manda. */
  de: string;
  /** Neurona a la que va (las demás lo ignoran). */
  para: string;
  ts: number;
}

export interface OfertaWifi extends BaseWifi {
  t: "enlace.wifi.oferta";
  cap: CapacidadesWifi;
  /** Clave pública ECDH P-256 (JWK) para cifrarle las credenciales. */
  epub: JsonWebKey;
  clase: ClaseNecesidad;
  nombre?: string;
}

export interface RespuestaWifi extends BaseWifi {
  t: "enlace.wifi.respuesta";
  acepta: boolean;
  motivo?: MotivoRechazo;
  cap?: CapacidadesWifi;
  epub?: JsonWebKey;
  roles?: RolesWifi;
  nombre?: string;
}

/** Sobre cifrado por destinatario (v:3 de `recipient-crypto.ts`): opaco para este módulo. */
export interface SobreCifradoWifi {
  v: 3;
  iv: string;
  ct: string;
  epk: JsonWebKey;
  rfp?: string;
}

export interface ListoWifi extends BaseWifi {
  t: "enlace.wifi.listo";
  fase: "red" | "unida";
  /** Fase «red»: credenciales cifradas para el cliente. */
  cred?: SobreCifradoWifi;
  /** Fase «unida»: IP del cliente en la red nueva. */
  ip?: string;
  /** Fase «unida»: velocidad de la radio que dice el sistema del cliente (Mb/s), si la dice. */
  mbps?: number;
}

export interface CierreWifi extends BaseWifi {
  t: "enlace.wifi.cierre";
  motivo: MotivoCierre;
}

export type MensajeWifi = OfertaWifi | RespuestaWifi | ListoWifi | CierreWifi;

/** ¿Es un texto de control de esta capa? (filtro barato antes de parsear). */
export function esTextoWifi(x: unknown): boolean {
  if (typeof x === "string") return x.startsWith('{"t":"enlace.wifi.');
  return !!x && typeof x === "object" && typeof (x as { t?: unknown }).t === "string" && ((x as { t: string }).t).startsWith(PREFIJO_MENSAJE_WIFI);
}

function corto(x: unknown, max: number): string | null {
  return typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null;
}

function esJwkEc(x: unknown): x is JsonWebKey {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.kty === "EC" && o.crv === "P-256" && typeof o.x === "string" && typeof o.y === "string" && o.x.length <= 64 && o.y.length <= 64 && !("d" in o);
}

/** Solo la parte pública (nunca viaja `d`, aunque alguien lo meta por error). */
function soloPublica(j: JsonWebKey): JsonWebKey {
  return { kty: "EC", crv: "P-256", x: j.x, y: j.y };
}

function esSobreCifrado(x: unknown): x is SobreCifradoWifi {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.v === 3 && typeof o.iv === "string" && typeof o.ct === "string" && o.ct.length <= 4096 && esJwkEc(o.epk);
}

/**
 * leerMensajeWifi — valida un cuerpo YA verificado (firma) y devuelve el mensaje tipado, o null. Nunca
 * acepta un mensaje con credenciales en claro: un `listo` de fase «red» sin sobre cifrado se descarta. Puro.
 */
export function leerMensajeWifi(x: unknown): MensajeWifi | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!TIPOS_WIFI.includes(o.t as TipoMensajeWifi) || o.v !== 1) return null;
  const sesion = corto(o.sesion, 64);
  const de = corto(o.de, 80);
  const para = corto(o.para, 80);
  if (!sesion || !de || !para || de === para || typeof o.ts !== "number" || !Number.isFinite(o.ts)) return null;
  const base = { v: 1 as const, sesion, de, para, ts: o.ts };
  const nombre = corto(o.nombre, 60);
  switch (o.t) {
    case "enlace.wifi.oferta": {
      const cap = leerCapacidades(o.cap);
      if (!cap || !esJwkEc(o.epub)) return null;
      const clase = CLASES.includes(o.clase as ClaseNecesidad) ? (o.clase as ClaseNecesidad) : "manual";
      return { t: "enlace.wifi.oferta", ...base, cap, epub: soloPublica(o.epub), clase, ...(nombre ? { nombre } : {}) };
    }
    case "enlace.wifi.respuesta": {
      if (typeof o.acepta !== "boolean") return null;
      if (!o.acepta) {
        const motivo = MOTIVOS_RECHAZO.includes(o.motivo as MotivoRechazo) ? (o.motivo as MotivoRechazo) : "sin-capacidad";
        return { t: "enlace.wifi.respuesta", ...base, acepta: false, motivo, ...(nombre ? { nombre } : {}) };
      }
      const cap = leerCapacidades(o.cap);
      const roles = leerRoles(o.roles);
      if (!cap || !roles || !esJwkEc(o.epub)) return null;
      return { t: "enlace.wifi.respuesta", ...base, acepta: true, cap, epub: soloPublica(o.epub), roles, ...(nombre ? { nombre } : {}) };
    }
    case "enlace.wifi.listo": {
      if (o.fase === "red") {
        if (!esSobreCifrado(o.cred)) return null; // sin cifrar no se acepta jamás
        const c = o.cred;
        return { t: "enlace.wifi.listo", ...base, fase: "red", cred: { v: 3, iv: c.iv, ct: c.ct, epk: soloPublica(c.epk), ...(typeof c.rfp === "string" ? { rfp: c.rfp.slice(0, 40) } : {}) } };
      }
      if (o.fase === "unida") {
        const ip = ipPrivada(o.ip);
        const mbps = typeof o.mbps === "number" && Number.isFinite(o.mbps) && o.mbps > 0 && o.mbps < 100_000 ? Math.round(o.mbps) : undefined;
        return { t: "enlace.wifi.listo", ...base, fase: "unida", ...(ip ? { ip } : {}), ...(mbps ? { mbps } : {}) };
      }
      return null;
    }
    case "enlace.wifi.cierre": {
      const motivo = MOTIVOS_CIERRE.includes(o.motivo as MotivoCierre) ? (o.motivo as MotivoCierre) : "persona";
      return { t: "enlace.wifi.cierre", ...base, motivo };
    }
    default:
      return null;
  }
}

/** Forma del cable: `{"t":<tipo>,"s":<sobre firmado>}`. */
export function enCable(t: TipoMensajeWifi, sobre: unknown): { t: TipoMensajeWifi; s: unknown } {
  return { t, s: sobre };
}

/** Lee la forma del cable (texto u objeto). Null si no es de esta capa. Puro. */
export function leerCable(x: unknown): { t: TipoMensajeWifi; s: unknown } | null {
  let o: unknown = x;
  if (typeof x === "string") {
    if (!esTextoWifi(x) || x.length > 32 * 1024) return null;
    try {
      o = JSON.parse(x);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const r = o as { t?: unknown; s?: unknown };
  if (!TIPOS_WIFI.includes(r.t as TipoMensajeWifi) || !r.s || typeof r.s !== "object") return null;
  return { t: r.t as TipoMensajeWifi, s: r.s };
}

/**
 * ¿De quién se acepta una negociación? Solo de una neurona VINCULADA cuya firma es la del vínculo, o de
 * una ligada por el canal local con esa misma huella (vínculo o prueba de cuenta, MLL1107A), o llegada por
 * la malla de la CUENTA (solo tus aparatos la tienen). Lo demás se rechaza sin contestar. Puro.
 */
export function remitenteDeConfianza(p: {
  de: string;
  huella: string | undefined;
  vinculos: ReadonlyArray<{ neurona: string; huella?: string }>;
  ligaduras: ReadonlyArray<{ neurona: string; huella: string }>;
  origen?: { tipo?: string } | null;
}): boolean {
  if (!p.huella) return false;
  if (p.vinculos.some((v) => v.neurona === p.de && !!v.huella && v.huella === p.huella)) return true;
  if (p.ligaduras.some((l) => l.neurona === p.de && l.huella === p.huella)) return true;
  return p.origen?.tipo === "cuenta";
}

/* ══════════════════════════ Máquina de estados ══════════════════════════ */

export type FaseWifi =
  | "inactivo"
  | "ofreciendo"
  | "decidiendo"
  | "abriendo-red"
  | "esperando-red"
  | "uniendo"
  | "esperando-union"
  | "activo"
  | "cerrado"
  | "fallido";

/** Fases con una negociación o un enlace en marcha (la radio está ocupada). */
export const FASES_OCUPADAS: readonly FaseWifi[] = ["ofreciendo", "decidiendo", "abriendo-red", "esperando-red", "uniendo", "esperando-union", "activo"];

export function ocupada(f: FaseWifi): boolean {
  return FASES_OCUPADAS.includes(f);
}

export interface EstadoWifi {
  fase: FaseWifi;
  sesion: string | null;
  /** Esta neurona (la que firma lo que se manda en esta sesión). */
  yo: string | null;
  /** La otra neurona. */
  otro: string | null;
  nombreOtro: string | null;
  soyIniciador: boolean;
  roles: RolesWifi | null;
  capOtro: CapacidadesWifi | null;
  epubOtro: JsonWebKey | null;
  clase: ClaseNecesidad | null;
  /** La red (sin contraseña). */
  red: RedWifiPublica | null;
  ipPropia: string | null;
  ipOtro: string | null;
  mbps: number | null;
  /** Inicio de la fase actual. */
  desde: number;
  /** Plazo de la fase (null = sin plazo). */
  vence: number | null;
  /** Último tráfico por el enlace (para cerrarlo solo). */
  ultimoUso: number;
  /** Por qué falló o se cerró (frase para la persona). */
  motivo: string | null;
  /** Código del último cierre o rechazo. */
  codigo: MotivoCierre | MotivoRechazo | null;
}

export const WIFI_INICIAL: EstadoWifi = {
  fase: "inactivo",
  sesion: null,
  yo: null,
  otro: null,
  nombreOtro: null,
  soyIniciador: false,
  roles: null,
  capOtro: null,
  epubOtro: null,
  clase: null,
  red: null,
  ipPropia: null,
  ipOtro: null,
  mbps: null,
  desde: 0,
  vence: null,
  ultimoUso: 0,
  motivo: null,
  codigo: null,
};

/** Lo propio que la máquina necesita para contestar (sale del motor). */
export interface Propio {
  neurona: string;
  nombre: string;
  cap: CapacidadesWifi;
  epub: JsonWebKey;
}

export type AjusteWifiDirecto = "automatico" | "preguntar" | "nunca";

export type EventoWifi =
  | { t: "abrir"; ahora: number; sesion: string; otro: string; nombreOtro?: string; clase: ClaseNecesidad; propio: Propio }
  | { t: "recibido"; ahora: number; msg: MensajeWifi; propio: Propio; ajuste: AjusteWifiDirecto }
  /** El cliente descifró y validó las credenciales del `listo` fase «red». */
  | { t: "credenciales"; ahora: number; sesion: string; cred: CredencialesWifi }
  /** El sobre del `listo` no se pudo abrir o no traía credenciales válidas. */
  | { t: "credenciales-invalidas"; ahora: number; sesion: string }
  | { t: "persona"; ahora: number; acepta: boolean; propio: Propio }
  /** La parte nativa levantó el punto de acceso (soy AP). La contraseña va solo en la acción. */
  | { t: "red-lista"; ahora: number; cred: CredencialesWifi }
  /** La parte nativa ya está en la red del otro (soy cliente). */
  | { t: "unida"; ahora: number; ipPropia: string | null; mbps?: number | null }
  | { t: "error-nativo"; ahora: number; codigo: "permiso-denegado" | "sin-soporte" | "fallo-nativo" | "no-encontrada"; texto: string }
  | { t: "tic"; ahora: number }
  | { t: "uso"; ahora: number }
  | { t: "cerrar"; ahora: number; motivo: MotivoCierre; texto?: string };

/** Mensaje sin firmar que el motor firma y manda al otro. */
export type MensajeSinFirma = OfertaWifi | RespuestaWifi | (ListoWifi & { fase: "unida" }) | CierreWifi;

export type AccionWifi =
  | { a: "enviar"; msg: MensajeSinFirma }
  /** Cifrar las credenciales para `epub` y mandar el `listo` fase «red». */
  | { a: "enviar-credenciales"; cred: CredencialesWifi; epub: JsonWebKey; sesion: string; para: string }
  | { a: "abrir-ap"; sesion: string; metodo: MetodoAp }
  | { a: "unirse"; sesion: string; metodo: MetodoCliente; cred: CredencialesWifi }
  | { a: "cerrar-nativo"; sesion: string }
  | { a: "preguntar-persona"; sesion: string; otro: string; nombreOtro: string | null; clase: ClaseNecesidad }
  | { a: "activo"; sesion: string }
  /** Se sigue por el enlace de antes; `motivo` dice por qué. */
  | { a: "respaldo"; motivo: string };

export interface PasoWifi {
  estado: EstadoWifi;
  acciones: AccionWifi[];
}

/** Frases para la persona: por qué la otra neurona dijo que no. */
export const TEXTO_RECHAZO: Record<MotivoRechazo, string> = {
  nunca: "la otra neurona tiene el enlace Wi-Fi directo en «Nunca»",
  persona: "en la otra neurona dijeron que no",
  "sin-capacidad": "entre estos dos aparatos no hay forma de abrir una red directa (hace falta un Android que la levante)",
  ocupada: "la otra neurona ya tiene un enlace Wi-Fi directo abierto o en marcha",
  "sin-confianza": "la otra neurona no reconoce a esta (vinculadlas primero con «Sincronizar ahora»)",
  version: "la otra neurona habla otra versión del protocolo",
};

/** Frases para la persona: por qué se cerró. */
export const TEXTO_CIERRE: Record<MotivoCierre, string> = {
  persona: "cerrado por la persona",
  inactivo: "sin uso en 5 minutos: cerrado para devolver la radio",
  plazo: "la otra neurona tardó demasiado",
  "permiso-denegado": "el sistema no dio permiso para crear o unirse a la red",
  "sin-soporte": "este aparato no puede abrir esa red",
  "fallo-nativo": "el sistema no pudo abrir la red",
  "no-encontrada": "la red del otro aparato no aparece (¿demasiado lejos?)",
  credenciales: "las credenciales no se pudieron descifrar o no valen",
  roles: "los roles propuestos no cuadran con lo que puede cada aparato",
  rechazo: "la otra neurona no aceptó",
  sustituida: "se abrió otra negociación a la vez y quedó la otra",
};

const FASE_TEXTO: Record<FaseWifi, string> = {
  inactivo: "sin enlace",
  ofreciendo: "esperando respuesta",
  decidiendo: "esperando a la persona",
  "abriendo-red": "levantando la red",
  "esperando-red": "esperando la red del otro",
  uniendo: "uniéndose a la red",
  "esperando-union": "esperando a que el otro entre",
  activo: "activo",
  cerrado: "cerrado",
  fallido: "falló",
};

export function textoFase(f: FaseWifi): string {
  return FASE_TEXTO[f];
}

function base(e: EstadoWifi, ahora: number): BaseWifi {
  return { v: 1, sesion: e.sesion ?? "", de: e.yo ?? "", para: e.otro ?? "", ts: ahora };
}

function con(e: EstadoWifi, cambios: Partial<EstadoWifi>, ahora: number): EstadoWifi {
  return { ...e, ...cambios, desde: cambios.fase && cambios.fase !== e.fase ? ahora : e.desde };
}

/** Plazo de la fase en la que entra el cliente al unirse (la vía guiada espera a la persona). */
function plazoUnirse(m: MetodoCliente): number {
  return m === "guiado" ? PLAZOS_WIFI.unirseGuiado : PLAZOS_WIFI.unirse;
}

/** Fases en las que la parte nativa ya pudo tocar la radio (hay que apagarla al terminar). */
const FASES_NATIVAS: readonly FaseWifi[] = ["abriendo-red", "esperando-red", "uniendo", "esperando-union", "activo"];

/** Termina (fallo o cierre) avisando al otro si hace falta y apagando lo nativo. */
function terminar(e: EstadoWifi, p: { ahora: number; codigo: MotivoCierre; texto: string; avisar: boolean; fallo: boolean }): PasoWifi {
  const acciones: AccionWifi[] = [];
  if (p.avisar && e.sesion && e.otro && e.yo) acciones.push({ a: "enviar", msg: { t: "enlace.wifi.cierre", ...base(e, p.ahora), motivo: p.codigo } });
  if (e.sesion && FASES_NATIVAS.includes(e.fase)) acciones.push({ a: "cerrar-nativo", sesion: e.sesion });
  if (p.fallo) acciones.push({ a: "respaldo", motivo: `Enlace Wi-Fi directo: ${p.texto}. Se sigue por el enlace de antes.` });
  return {
    estado: con(e, { fase: p.fallo ? "fallido" : "cerrado", vence: null, motivo: p.texto, codigo: p.codigo, red: null, ipOtro: null, ipPropia: null, mbps: null }, p.ahora),
    acciones,
  };
}

/** Acepta una oferta: contesta con los roles y arranca su parte. */
function aceptar(e: EstadoWifi, propio: Propio, ahora: number): PasoWifi {
  const roles = e.roles as RolesWifi;
  const respuesta: RespuestaWifi = {
    t: "enlace.wifi.respuesta",
    ...base(e, ahora),
    acepta: true,
    cap: propio.cap,
    epub: propio.epub,
    roles,
    nombre: propio.nombre,
  };
  const ap = roles.ap === propio.neurona;
  const acciones: AccionWifi[] = [{ a: "enviar", msg: respuesta }];
  if (ap) acciones.push({ a: "abrir-ap", sesion: e.sesion as string, metodo: roles.metodoAp });
  return {
    estado: con(e, { fase: ap ? "abriendo-red" : "esperando-red", vence: ahora + (ap ? PLAZOS_WIFI.abrirRed : PLAZOS_WIFI.esperarRed) }, ahora),
    acciones,
  };
}

function rechazar(msg: OfertaWifi, propio: Propio, motivo: MotivoRechazo, ahora: number): AccionWifi {
  return {
    a: "enviar",
    msg: { t: "enlace.wifi.respuesta", v: 1, sesion: msg.sesion, de: propio.neurona, para: msg.de, ts: ahora, acepta: false, motivo, nombre: propio.nombre },
  };
}

function recibirOferta(e: EstadoWifi, msg: OfertaWifi, propio: Propio, ajuste: AjusteWifiDirecto, ahora: number): PasoWifi {
  if (ocupada(e.fase)) {
    // Las dos ofrecieron a la vez: queda la oferta de la neurona de id menor (las dos lo deciden igual).
    const cruce = e.fase === "ofreciendo" && e.otro === msg.de;
    if (!cruce) return { estado: e, acciones: [rechazar(msg, propio, "ocupada", ahora)] };
    if (propio.neurona < msg.de) return { estado: e, acciones: [] }; // la mía gana: el otro contestará a la mía
    // La suya gana: la mía se olvida (nada nativo arrancó aún) y se atiende la suya.
  }
  if (ajuste === "nunca") return { estado: ocupada(e.fase) ? { ...WIFI_INICIAL, desde: ahora } : e, acciones: [rechazar(msg, propio, "nunca", ahora)] };
  const roles = elegirRoles({ neurona: propio.neurona, cap: propio.cap }, { neurona: msg.de, cap: msg.cap });
  if (!roles) return { estado: ocupada(e.fase) ? { ...WIFI_INICIAL, desde: ahora } : e, acciones: [rechazar(msg, propio, "sin-capacidad", ahora)] };
  const nuevo: EstadoWifi = {
    ...WIFI_INICIAL,
    fase: "decidiendo",
    sesion: msg.sesion,
    yo: propio.neurona,
    otro: msg.de,
    nombreOtro: msg.nombre ?? null,
    soyIniciador: false,
    roles,
    capOtro: msg.cap,
    epubOtro: msg.epub,
    clase: msg.clase,
    desde: ahora,
    vence: ahora + PLAZOS_WIFI.persona,
    ultimoUso: ahora,
  };
  if (ajuste === "preguntar") {
    return { estado: nuevo, acciones: [{ a: "preguntar-persona", sesion: msg.sesion, otro: msg.de, nombreOtro: msg.nombre ?? null, clase: msg.clase }] };
  }
  return aceptar(nuevo, propio, ahora);
}

function recibirRespuesta(e: EstadoWifi, msg: RespuestaWifi, propio: Propio, ahora: number): PasoWifi {
  if (e.fase !== "ofreciendo") return { estado: e, acciones: [] };
  if (!msg.acepta) {
    const codigo = msg.motivo ?? "sin-capacidad";
    const texto = TEXTO_RECHAZO[codigo];
    return {
      estado: con(e, { fase: "fallido", vence: null, motivo: texto, codigo, nombreOtro: msg.nombre ?? e.nombreOtro }, ahora),
      acciones: [{ a: "respaldo", motivo: `Enlace Wi-Fi directo: ${texto}. Se sigue por el enlace de antes.` }],
    };
  }
  const cap = msg.cap as CapacidadesWifi;
  const roles = msg.roles as RolesWifi;
  const conOtro: EstadoWifi = { ...e, capOtro: cap, epubOtro: msg.epub ?? null, nombreOtro: msg.nombre ?? e.nombreOtro };
  if (!rolesValidos(roles, { neurona: propio.neurona, cap: propio.cap }, { neurona: msg.de, cap })) {
    return terminar(conOtro, { ahora, codigo: "roles", texto: TEXTO_CIERRE.roles, avisar: true, fallo: true });
  }
  const ap = roles.ap === propio.neurona;
  const estado = con(conOtro, { roles, fase: ap ? "abriendo-red" : "esperando-red", vence: ahora + (ap ? PLAZOS_WIFI.abrirRed : PLAZOS_WIFI.esperarRed) }, ahora);
  return { estado, acciones: ap ? [{ a: "abrir-ap", sesion: e.sesion as string, metodo: roles.metodoAp }] : [] };
}

/**
 * pasoWifi — la máquina de estados de UNA neurona (una sola negociación a la vez: hay una radio).
 * Determinista y pura: el motor ejecuta las acciones (firmar y mandar, cifrar, llamar a la parte nativa).
 */
export function pasoWifi(e: EstadoWifi, ev: EventoWifi): PasoWifi {
  const ahora = ev.ahora;
  switch (ev.t) {
    case "abrir": {
      if (ocupada(e.fase) || ev.otro === ev.propio.neurona) return { estado: e, acciones: [] };
      const nuevo: EstadoWifi = {
        ...WIFI_INICIAL,
        fase: "ofreciendo",
        sesion: ev.sesion,
        yo: ev.propio.neurona,
        otro: ev.otro,
        nombreOtro: ev.nombreOtro ?? null,
        soyIniciador: true,
        clase: ev.clase,
        desde: ahora,
        vence: ahora + PLAZOS_WIFI.respuesta,
        ultimoUso: ahora,
      };
      const oferta: OfertaWifi = {
        t: "enlace.wifi.oferta",
        ...base(nuevo, ahora),
        cap: ev.propio.cap,
        epub: ev.propio.epub,
        clase: ev.clase,
        nombre: ev.propio.nombre,
      };
      return { estado: nuevo, acciones: [{ a: "enviar", msg: oferta }] };
    }
    case "recibido": {
      const msg = ev.msg;
      if (msg.para !== ev.propio.neurona || msg.de === ev.propio.neurona) return { estado: e, acciones: [] };
      if (msg.t === "enlace.wifi.oferta") return recibirOferta(e, msg, ev.propio, ev.ajuste, ahora);
      if (msg.sesion !== e.sesion || msg.de !== e.otro) return { estado: e, acciones: [] };
      if (msg.t === "enlace.wifi.respuesta") return recibirRespuesta(e, msg, ev.propio, ahora);
      if (msg.t === "enlace.wifi.cierre") {
        if (!ocupada(e.fase)) return { estado: e, acciones: [] };
        return terminar(e, { ahora, codigo: msg.motivo, texto: `la otra neurona cerró: ${TEXTO_CIERRE[msg.motivo]}`, avisar: false, fallo: e.fase !== "activo" });
      }
      // listo
      if (msg.fase === "unida") {
        if (e.fase !== "esperando-union") return { estado: e, acciones: [] };
        return {
          estado: con(e, { fase: "activo", vence: null, ipOtro: msg.ip ?? e.ipOtro, mbps: msg.mbps ?? e.mbps, ultimoUso: ahora, motivo: null, codigo: null }, ahora),
          acciones: [{ a: "activo", sesion: e.sesion as string }],
        };
      }
      // Fase «red»: el motor la convierte en `credenciales` / `credenciales-invalidas` tras descifrar.
      return { estado: e, acciones: [] };
    }
    case "credenciales": {
      if (e.fase !== "esperando-red" || ev.sesion !== e.sesion || !e.roles) return { estado: e, acciones: [] };
      const m = e.roles.metodoCliente;
      return {
        estado: con(e, { fase: "uniendo", vence: ahora + plazoUnirse(m), red: redPublica(ev.cred), ipOtro: ev.cred.ipAp }, ahora),
        acciones: [{ a: "unirse", sesion: e.sesion as string, metodo: m, cred: ev.cred }],
      };
    }
    case "credenciales-invalidas": {
      if (e.fase !== "esperando-red" || ev.sesion !== e.sesion) return { estado: e, acciones: [] };
      return terminar(e, { ahora, codigo: "credenciales", texto: TEXTO_CIERRE.credenciales, avisar: true, fallo: true });
    }
    case "persona": {
      if (e.fase !== "decidiendo" || !e.sesion || !e.otro) return { estado: e, acciones: [] };
      if (ev.acepta) return aceptar(e, ev.propio, ahora);
      const r: RespuestaWifi = { t: "enlace.wifi.respuesta", ...base(e, ahora), acepta: false, motivo: "persona", nombre: ev.propio.nombre };
      return { estado: con(e, { fase: "cerrado", vence: null, motivo: "dijiste que no", codigo: "persona" }, ahora), acciones: [{ a: "enviar", msg: r }] };
    }
    case "red-lista": {
      if (e.fase !== "abriendo-red" || !e.sesion || !e.otro || !e.epubOtro) return { estado: e, acciones: [] };
      const extra = e.roles?.metodoCliente === "guiado" ? PLAZOS_WIFI.unirseGuiado : 0;
      return {
        estado: con(e, { fase: "esperando-union", vence: ahora + PLAZOS_WIFI.esperarUnion + extra, red: redPublica(ev.cred), ipPropia: ev.cred.ipAp }, ahora),
        acciones: [{ a: "enviar-credenciales", cred: ev.cred, epub: e.epubOtro, sesion: e.sesion, para: e.otro }],
      };
    }
    case "unida": {
      if (e.fase !== "uniendo" || !e.sesion || !e.otro) return { estado: e, acciones: [] };
      const mbps = typeof ev.mbps === "number" && Number.isFinite(ev.mbps) && ev.mbps > 0 ? Math.round(ev.mbps) : null;
      const listo: ListoWifi & { fase: "unida" } = {
        t: "enlace.wifi.listo",
        ...base(e, ahora),
        fase: "unida",
        ...(ev.ipPropia ? { ip: ev.ipPropia } : {}),
        ...(mbps ? { mbps } : {}),
      };
      return {
        estado: con(e, { fase: "activo", vence: null, ipPropia: ev.ipPropia, mbps: mbps ?? e.mbps, ultimoUso: ahora }, ahora),
        acciones: [{ a: "enviar", msg: listo }, { a: "activo", sesion: e.sesion }],
      };
    }
    case "error-nativo": {
      if (!FASES_NATIVAS.includes(e.fase)) return { estado: e, acciones: [] };
      return terminar(e, { ahora, codigo: ev.codigo, texto: ev.texto || TEXTO_CIERRE[ev.codigo], avisar: true, fallo: e.fase !== "activo" });
    }
    case "uso":
      return e.fase === "activo" ? { estado: { ...e, ultimoUso: ahora }, acciones: [] } : { estado: e, acciones: [] };
    case "tic": {
      // Lo cierra por inactividad quien lo pidió (sabe cuándo terminó); el otro solo si pasa el triple
      // (quien lo pidió desapareció sin cerrar): así no se corta una pantalla que solo va en un sentido.
      const limite = e.soyIniciador ? INACTIVIDAD_WIFI_MS : 3 * INACTIVIDAD_WIFI_MS;
      if (e.fase === "activo" && ahora - e.ultimoUso >= limite) {
        return terminar(e, { ahora, codigo: "inactivo", texto: TEXTO_CIERRE.inactivo, avisar: true, fallo: false });
      }
      if (!ocupada(e.fase) || e.vence === null || ahora < e.vence) return { estado: e, acciones: [] };
      if (e.fase === "decidiendo") {
        // Sin decisión a tiempo cuenta como «no»: se le dice al otro para que no espere más.
        const r: RespuestaWifi = { t: "enlace.wifi.respuesta", ...base(e, ahora), acepta: false, motivo: "persona" };
        return { estado: con(e, { fase: "cerrado", vence: null, motivo: "nadie contestó a tiempo", codigo: "persona" }, ahora), acciones: [{ a: "enviar", msg: r }] };
      }
      return terminar(e, { ahora, codigo: "plazo", texto: `${TEXTO_CIERRE.plazo} (${textoFase(e.fase)})`, avisar: true, fallo: true });
    }
    case "cerrar": {
      if (!ocupada(e.fase)) return { estado: e, acciones: [] };
      if (e.fase === "decidiendo") return pasoWifi(e, { t: "persona", ahora, acepta: false, propio: { neurona: e.yo ?? "", nombre: "", cap: SIN_CAPACIDADES, epub: {} } });
      return terminar(e, { ahora, codigo: ev.motivo, texto: ev.texto ?? TEXTO_CIERRE[ev.motivo], avisar: true, fallo: false });
    }
    default:
      return { estado: e, acciones: [] };
  }
}

/** ¿Soy yo el punto de acceso en esta negociación? */
export function soyAp(e: EstadoWifi): boolean {
  return !!e.roles && !!e.yo && e.roles.ap === e.yo;
}
