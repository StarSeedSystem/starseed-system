/*
 * permisos-inicio-ejecutor — pide cada permiso del asistente al sistema (PER1108A, 2026-11-08).
 * Contrato: architecture/red-sin-dependencias.md §4. Reutiliza lo que ya existía, sin duplicarlo:
 *  · Bluetooth: `ble_activar` / `ble_estado` / `ble_pedir_permiso` (bluetooth-directo-estado.ts);
 *  · Wi-Fi directo: `enlace_wifi_permiso` («Dispositivos cercanos» en Android, «Ubicación» en macOS);
 *  · micrófono y cámara en macOS: `getUserMedia` (el sistema pregunta con los textos de Info.plist; es
 *    lo que ya hace permiso-medios.ts); en Android, Kotlin (`permisos_inicio_pedir`);
 *  · notificaciones: el plugin de Tauri o la API web.
 * Todo se INYECTA (`DepsEjecutor`) para probarlo sin la app. Nunca lanza: siempre devuelve un resultado.
 * Un permiso pendiente en el sistema (el aviso sigue en pantalla) se espera con tope; pasado el tope se
 * da por «omitido» (no se insiste: la persona lo contesta cuando quiera y se ve en Ajustes).
 */

import type { EstadosSistema, IdPermiso, ResultadoPermiso, SistemaAsistente } from "./permisos-inicio";
import { normalizarEstados, type AccionPermiso, type EstadoSistema } from "./permisos-registro";

export interface DepsEjecutor {
  /** Llama a un comando de la app. */
  llamar<T = unknown>(comando: string, args?: Record<string, unknown>): Promise<{ ok: boolean; valor?: T; motivo?: string }>;
  /** `navigator.mediaDevices.getUserMedia` (null si no existe). */
  pedirMedio: ((tipo: "audio" | "video") => Promise<"ok" | "denegado" | "no-hay">) | null;
  /** Notificaciones: "granted" | "denied" | "default" | null (no hay API). */
  pedirNotificaciones: (() => Promise<string | null>) | null;
  /** (PER1111S) Notificaciones ya concedidas, SIN preguntar (plugin de Tauri); null si no se puede saber. */
  notificacionesConcedidas?: (() => Promise<boolean | null>) | null;
  dormir(ms: number): Promise<void>;
  ahora(): number;
}

export interface OpcionesEspera {
  intervaloMs: number;
  topeMs: number;
}

/** Repite `leer` hasta que `listo` lo dé por bueno o se acabe el tope. Devuelve la última lectura. Pura (con deps). */
export async function esperarHasta<T>(
  leer: () => Promise<T>,
  listo: (x: T) => boolean,
  deps: Pick<DepsEjecutor, "dormir" | "ahora">,
  op: OpcionesEspera,
): Promise<{ valor: T; agotado: boolean }> {
  const fin = deps.ahora() + op.topeMs;
  let valor = await leer();
  while (!listo(valor)) {
    if (deps.ahora() >= fin) return { valor, agotado: true };
    await deps.dormir(op.intervaloMs);
    valor = await leer();
  }
  return { valor, agotado: false };
}

const ESPERA_AVISO: OpcionesEspera = { intervaloMs: 1_000, topeMs: 90_000 };
const ESPERA_AJUSTES: OpcionesEspera = { intervaloMs: 2_000, topeMs: 120_000 };

/* ── Bluetooth (macOS) ── */

/** Del estado del Bluetooth directo al resultado del permiso. Pura. */
export function resultadoBluetooth(radio: string | null | undefined): ResultadoPermiso | "esperar" {
  switch (radio) {
    case "encendida":
    case "apagada":
      // «apagada»: el permiso está dado; solo el interruptor del Bluetooth (o el de StarSeed) está apagado.
      return "concedido";
    case "sin-permiso":
      return "denegado";
    case "no-disponible":
      return "no-disponible";
    default:
      return "esperar";
  }
}

async function radioBle(d: DepsEjecutor): Promise<string | null> {
  const r = await d.llamar<{ radio?: unknown }>("ble_estado");
  return r.ok && r.valor && typeof r.valor.radio === "string" ? r.valor.radio : null;
}

async function pedirBluetooth(d: DepsEjecutor): Promise<ResultadoPermiso> {
  // Arrancar los gestores de CoreBluetooth es lo que hace que macOS pregunte (con el Info.plist ya sellado).
  await d.llamar("ble_activar", { activo: true });
  const { valor, agotado } = await esperarHasta(() => radioBle(d), (r) => resultadoBluetooth(r) !== "esperar", d, ESPERA_AVISO);
  if (agotado) return "omitido";
  const r = resultadoBluetooth(valor);
  return r === "esperar" ? "omitido" : r;
}

/* ── Android: «Dispositivos cercanos» (Bluetooth + Wi-Fi directo), de uno en uno ── */

async function pedirCercanos(d: DepsEjecutor): Promise<ResultadoPermiso> {
  await d.llamar("ble_pedir_permiso");
  const ble = await esperarHasta(() => radioBle(d), (r) => r !== "sin-permiso" && r !== null && r !== "arrancando", d, ESPERA_AVISO);
  if (ble.agotado) return "omitido";
  if (ble.valor === "no-disponible") return "no-disponible";
  // Después, y no a la vez: el permiso de la red Wi-Fi directa (en Android 13+ es el MISMO «Dispositivos cercanos»).
  await d.llamar("enlace_wifi_permiso");
  return "concedido";
}

/* ── Android: llamadas sobre el bloqueo (LLA1108D) ── */

/**
 * De las capacidades de las llamadas nativas al resultado del permiso de «pantalla completa». Android 14+ lo
 * trata como ajuste especial («Notificaciones a pantalla completa»); antes, o en un aparato sin él, no hace falta. Pura.
 */
export function resultadoLlamadas(capacidades: unknown): ResultadoPermiso | "esperar" {
  if (!capacidades || typeof capacidades !== "object") return "no-disponible";
  const c = capacidades as { nativa?: unknown; pantalla_completa?: unknown };
  if (c.nativa !== true) return "no-disponible";
  if (c.pantalla_completa === "concedido" || c.pantalla_completa === "no-aplica") return "concedido";
  return "esperar";
}

async function pedirLlamadas(d: DepsEjecutor): Promise<ResultadoPermiso> {
  const leer = async (): Promise<unknown> => {
    const r = await d.llamar("llamada_nativa_capacidades");
    return r.ok ? r.valor : null;
  };
  const primera = resultadoLlamadas(await leer());
  if (primera !== "esperar") return primera;
  // Abre la pantalla de Ajustes de ese permiso; se espera a que la persona vuelva con él concedido.
  await d.llamar("llamada_nativa_permiso");
  const { valor, agotado } = await esperarHasta(leer, (c) => resultadoLlamadas(c) !== "esperar", d, ESPERA_AJUSTES);
  if (agotado) return "omitido";
  const r = resultadoLlamadas(valor);
  return r === "esperar" ? "omitido" : r;
}

/* ── macOS: Ubicación (nombres de Wi-Fi) ── */

export function resultadoUbicacion(permiso: unknown): ResultadoPermiso | "esperar" {
  if (permiso === "concedido") return "concedido";
  if (permiso === "denegado") return "denegado";
  if (permiso === "no-aplica") return "no-disponible";
  return "esperar";
}

async function pedirUbicacionWifi(d: DepsEjecutor): Promise<ResultadoPermiso> {
  const leer = async (): Promise<unknown> => {
    const r = await d.llamar<{ permiso?: unknown }>("enlace_wifi_permiso");
    return r.ok && r.valor ? r.valor.permiso : null;
  };
  const { valor, agotado } = await esperarHasta(leer, (p) => resultadoUbicacion(p) !== "esperar", d, ESPERA_AVISO);
  if (agotado) return "omitido";
  const r = resultadoUbicacion(valor);
  return r === "esperar" ? "omitido" : r;
}

/* ── macOS: red local ── */

/**
 * macOS pregunta por la red local la primera vez que algo envía a la red (el faro del guardián ya lo hace al
 * arrancar). Aquí solo se fuerza una medición y se lee lo que dice la antena de la red local. Pura.
 */
export function resultadoRedLocal(antenas: unknown): ResultadoPermiso {
  const lista = antenas && typeof antenas === "object" ? (antenas as { antenas?: unknown }).antenas : null;
  if (!Array.isArray(lista)) return "omitido";
  const wifi = lista.find((a) => a && typeof a === "object" && /wi-?fi|faro|red/i.test(String((a as { id?: unknown }).id ?? "")));
  const estado = wifi ? String((wifi as { estado?: unknown }).estado ?? "") : "";
  if (estado === "sin-permiso") return "denegado";
  if (estado === "viva" || estado === "detectada") return "concedido";
  return "omitido";
}

async function pedirRedLocal(d: DepsEjecutor): Promise<ResultadoPermiso> {
  const r = await d.llamar("antenas_medir");
  return r.ok ? resultadoRedLocal(r.valor) : "omitido";
}

/* ── Medios, notificaciones ── */

async function pedirMedio(d: DepsEjecutor, tipo: "audio" | "video"): Promise<ResultadoPermiso> {
  if (!d.pedirMedio) return "no-disponible";
  try {
    const r = await d.pedirMedio(tipo);
    return r === "ok" ? "concedido" : r === "denegado" ? "denegado" : "no-disponible";
  } catch {
    return "denegado";
  }
}

async function pedirNotificaciones(d: DepsEjecutor): Promise<ResultadoPermiso> {
  if (!d.pedirNotificaciones) return "no-disponible";
  try {
    const r = await d.pedirNotificaciones();
    return r === "granted" ? "concedido" : r === "denied" ? "denegado" : r === null ? "no-disponible" : "omitido";
  } catch {
    return "denegado";
  }
}

/* ── Android por Kotlin ── */

interface EstadoInicio {
  puente_android?: boolean;
  microfono?: boolean;
  camara?: boolean;
  notificaciones?: boolean;
  instalar_apps?: boolean;
  bateria_exenta?: boolean;
}

const CAMPO_ANDROID: Partial<Record<IdPermiso, keyof EstadoInicio>> = {
  microfono: "microfono",
  camara: "camara",
  notificaciones: "notificaciones",
  instalar: "instalar_apps",
  bateria: "bateria_exenta",
};

async function pedirPorKotlin(d: DepsEjecutor, id: IdPermiso): Promise<ResultadoPermiso> {
  const campo = CAMPO_ANDROID[id];
  if (!campo) return "no-disponible";
  const leer = async (): Promise<boolean> => {
    const r = await d.llamar<EstadoInicio>("permisos_inicio_estado");
    return !!(r.ok && r.valor && r.valor[campo]);
  };
  if (await leer()) return "concedido";
  const p = await d.llamar("permisos_inicio_pedir", { permiso: id });
  if (!p.ok) return "no-disponible";
  // Dos ajustes (instalar, batería) abren una pantalla de Ajustes: se espera más.
  const op = id === "instalar" || id === "bateria" ? ESPERA_AJUSTES : ESPERA_AVISO;
  const { valor, agotado } = await esperarHasta(leer, (ok) => ok, d, op);
  return valor ? "concedido" : agotado ? "omitido" : "denegado";
}

/* ══════════════════ (PER1111S) Estado real, avisos del sistema y pantallas de Ajustes ══════════════════ */

export interface LecturaSistema {
  plataforma: string | null;
  /** Linux: «x11» | «wayland». */
  sesion: string | null;
  estados: EstadosSistema;
}

/**
 * Lee el estado REAL de todo lo que este sistema deja leer, sin abrir ningún aviso. Lo que no se puede leer no
 * aparece (la lista lo dice). Una app anterior a PER1111S no tiene `permisos_sistema_estado`: se lee lo de siempre.
 * Nunca lanza.
 */
export async function leerEstadosSistema(sistema: SistemaAsistente | null, d: DepsEjecutor): Promise<LecturaSistema> {
  const out: LecturaSistema = { plataforma: null, sesion: null, estados: {} };
  try {
    const r = await d.llamar<{ plataforma?: unknown; sesion?: unknown; estados?: unknown }>("permisos_sistema_estado");
    if (r.ok && r.valor) {
      out.estados = normalizarEstados(r.valor.estados);
      if (typeof r.valor.plataforma === "string") out.plataforma = r.valor.plataforma;
      if (typeof r.valor.sesion === "string" && r.valor.sesion) out.sesion = r.valor.sesion;
    }
  } catch {
    /* sin el comando: se sigue con lo demás */
  }
  const poner = (id: IdPermiso, e: EstadoSistema | null) => {
    if (e && !out.estados[id]) out.estados[id] = e;
  };
  try {
    if (sistema === "android") {
      const radio = await radioBle(d);
      poner("cercanos", radio === "sin-permiso" ? "no-concedido" : radio === "encendida" || radio === "apagada" ? "concedido" : null);
      const c = await d.llamar("llamada_nativa_capacidades");
      const l = c.ok ? resultadoLlamadas(c.valor) : null;
      poner("llamadas", l === "concedido" ? "concedido" : l === "no-disponible" ? "no-aplica" : l === "esperar" ? "no-concedido" : null);
    }
    if (sistema && sistema !== "android") {
      const f = await d.llamar<{ arranque_con_sistema?: unknown }>("fondo_estado");
      const a = f.ok && f.valor ? f.valor.arranque_con_sistema : null;
      poner("arranque", a === true ? "concedido" : a === false ? "no-concedido" : null);
    }
    if (sistema === "macos" && d.notificacionesConcedidas) {
      const n = await d.notificacionesConcedidas();
      poner("notificaciones", n === true ? "concedido" : n === false ? "no-concedido" : null);
    }
  } catch {
    /* lo que falle queda «sin dato» */
  }
  return out;
}

/** Espera a que el sistema dé `id` por concedido (la persona lo activa en Ajustes y vuelve). Pura (con deps). */
async function esperarConcedido(id: IdPermiso, sistema: SistemaAsistente, d: DepsEjecutor, op: OpcionesEspera = ESPERA_AJUSTES): Promise<ResultadoPermiso> {
  const { valor, agotado } = await esperarHasta(
    async () => (await leerEstadosSistema(sistema, d)).estados[id],
    (e) => e === "concedido" || e === "no-aplica",
    d,
    op,
  );
  if (valor === "concedido" || valor === "no-aplica") return "concedido";
  return agotado ? "omitido" : "denegado";
}

/** La pantalla de Android que abre cada permiso (`panel:<id>` en Kotlin). */
export function panelAndroid(id: IdPermiso): string {
  switch (id) {
    case "accesibilidad":
    case "superposicion":
    case "no-molestar":
    case "escribir-ajustes":
    case "todos-archivos":
    case "notificaciones":
    case "bateria":
      return id;
    default:
      return "app";
  }
}

const MEDIOS_CON_AJUSTES: Partial<Record<IdPermiso, string>> = { microfono: "microfono", camara: "camara", pantalla: "pantalla" };

/** Abre la pantalla EXACTA de Ajustes del permiso y espera a que la persona lo active. Nunca lanza. */
async function abrirAjustesYEsperar(id: IdPermiso, sistema: SistemaAsistente, d: DepsEjecutor): Promise<ResultadoPermiso> {
  if (sistema === "android" && (id === "instalar" || id === "bateria")) return pedirPorKotlin(d, id);
  if (sistema === "android" && id === "llamadas") return pedirLlamadas(d);
  const panel = sistema === "android" ? panelAndroid(id) : id;
  let abierto = (await d.llamar("permisos_sistema_abrir", { id: panel })).ok;
  // App anterior a PER1111S: micrófono, cámara y pantalla ya tenían su camino.
  if (!abierto && MEDIOS_CON_AJUSTES[id]) abierto = (await d.llamar("medios_abrir_ajustes", { tipo: MEDIOS_CON_AJUSTES[id] })).ok;
  if (!abierto) return "no-disponible";
  return esperarConcedido(id, sistema, d);
}

/** macOS: el aviso del PROPIO sistema (Accesibilidad, Grabación de pantalla, Monitorización de entrada). */
async function pedirAvisoMacos(id: IdPermiso, d: DepsEjecutor): Promise<ResultadoPermiso> {
  const r = await d.llamar<boolean>("permisos_sistema_pedir", { id });
  if (!r.ok) {
    // Sin el comando (app anterior): se abre directamente su pantalla de Ajustes.
    return abrirAjustesYEsperar(id, "macos", d);
  }
  if (r.valor === true) return "concedido";
  // El aviso de macOS lleva a Ajustes; se espera a que la persona lo active y vuelva.
  return esperarConcedido(id, "macos", d);
}

/** Escritorio: abrir al iniciar sesión (el interruptor de la propia app; el sistema lo enseña en sus ajustes). */
async function pedirArranque(sistema: SistemaAsistente, d: DepsEjecutor): Promise<ResultadoPermiso> {
  const r = await d.llamar<{ arranque_con_sistema?: unknown }>("fondo_arranque", { activo: true });
  if (!r.ok) return "no-disponible";
  if (r.valor && r.valor.arranque_con_sistema === true) return "concedido";
  return esperarConcedido("arranque", sistema, d, ESPERA_AVISO);
}

/**
 * Pide UN permiso al sistema y espera su respuesta. `accion` es la que enseña la lista (del registro): con
 * «abrir-ajustes» se abre la pantalla de Ajustes en vez de preguntar. Nunca lanza.
 */
export async function pedirPermisoInicio(
  id: IdPermiso,
  sistema: SistemaAsistente,
  d: DepsEjecutor,
  accion: AccionPermiso = "pedir",
): Promise<ResultadoPermiso> {
  try {
    if (accion === "abrir-ajustes") return await abrirAjustesYEsperar(id, sistema, d);
    if (id === "arranque" && sistema !== "android") return await pedirArranque(sistema, d);
    if (sistema === "macos" && (id === "accesibilidad" || id === "pantalla" || id === "monitor-entrada")) return await pedirAvisoMacos(id, d);
    if (sistema !== "macos" && sistema !== "android") return "no-disponible";
    if (sistema === "android") {
      if (id === "cercanos") return await pedirCercanos(d);
      if (id === "llamadas") return await pedirLlamadas(d);
      return await pedirPorKotlin(d, id);
    }
    switch (id) {
      case "bluetooth":
        return await pedirBluetooth(d);
      case "red-local":
        return await pedirRedLocal(d);
      case "notificaciones":
        return await pedirNotificaciones(d);
      case "microfono":
        return await pedirMedio(d, "audio");
      case "camara":
        return await pedirMedio(d, "video");
      case "ubicacion-wifi":
        return await pedirUbicacionWifi(d);
      default:
        return "no-disponible";
    }
  } catch {
    return "omitido";
  }
}
