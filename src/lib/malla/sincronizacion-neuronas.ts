/**
 * sincronizacion-neuronas — protocolo PURO de solicitud y aceptación de sincronización entre neuronas (2026-11-07 · MSH1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/sincronizacion-neuronas.md`.
 *
 * Petición de Alex: al pulsar «Sincronizar ahora» la otra neurona debe ver AL INSTANTE una ventana con
 * la solicitud; cuando las dos la aceptan, las dos dicen «Vinculadas» y el vínculo se puede recordar
 * para que en futuros encuentros se reconecten solas.
 *
 * Aquí vive todo lo que se puede decidir sin red: los mensajes (`sync.solicitud`, `sync.respuesta`,
 * `sync.vinculada`, `sync.cancelada`) y su validación, la máquina de estados de una solicitud, los
 * vínculos recordados (lo que se guarda en el aparato y lo que viaja con la cuenta), a qué IPs de la
 * red local se manda, en qué orden se prueban las vías, cuándo reconectar sola y las señales del radar
 * para las neuronas que la app nativa oye por faro. El motor con red es `sincronizacion-neuronas-motor.ts`.
 *
 * Puro: sin window, sin red, sin `node:*`. Las firmas las pone y comprueba el motor (identidad de malla).
 */

import {
  ANTENNA_COLOR,
  ANTENNA_LABEL,
  placeBySector,
  qualityFromAge,
  type DetectedSignal,
} from "@/ai/astraura/mesh/signals";

/* ══════════════════════════ Constantes ══════════════════════════ */

export const VERSION_PROTOCOLO = 1 as const;
/** Canal del transporte universal por el que viajan los mensajes `sync.*`. */
export const CANAL_SYNC = "sync";
/** Canal de los pings de latencia (nadie lo escucha: basta con el acuse del transporte). */
export const CANAL_PING = "sync.ping";
/** Puerto TCP del canal local de la app nativa (faro UDP 47070 + 1). */
export const PUERTO_MALLA_LOCAL = 47071;
/** Evento que emite la app nativa con cada mensaje recibido por el canal local. */
export const EVENTO_MALLA_LOCAL = "malla-local://mensaje";
/** Vínculos recordados en ESTE aparato (con la última IP local: nunca sale del aparato). */
export const CLAVE_VINCULOS_LOCAL = "starseed.malla.vinculos-neuronas.v1";
/** Vínculos recordados que viajan con la cuenta (uno por neurona, sin IPs). */
export const PREFIJO_VINCULOS_CUENTA = "starseed.malla.vinculos.";
export function claveVinculosCuenta(neurona: string): string {
  return `${PREFIJO_VINCULOS_CUENTA}${neurona}.v1`;
}
export const CADUCA_SOLICITUD_MS = 2 * 60_000;
export const MAX_CANDIDATOS_LAN = 8;
export const MAX_SOLICITUDES_POR_MINUTO = 3;
export const MAX_VINCULOS = 64;
/** Una neurona recordada que reaparece se reconecta sola, como mucho una vez por este intervalo. */
export const REINTENTO_RECONEXION_MS = 60_000;

/* ══════════════════════════ Tipos ══════════════════════════ */

export type ViaSync = "red-local-nativa" | "enlace-local" | "malla-cuenta" | "vinculo-par" | "rele" | "lora";

export const ETIQUETA_VIA: Record<ViaSync, string> = {
  "red-local-nativa": "la red local (app nativa, sin internet)",
  "enlace-local": "el enlace directo sin internet (código QR)",
  "malla-cuenta": "la malla P2P de tu cuenta",
  "vinculo-par": "el vínculo entre cuentas",
  rele: "el relé cifrado del servidor",
  lora: "la radio LoRa",
};

export type MedioNeurona = "app-nativa" | "navegador";

/** Lo que una neurona dice de sí misma en cada mensaje (público: nada de memorias, claves ni archivos). */
export interface NeuronaSync {
  /** Id de neurona (`neuron_devices`). Vacío solo en el destino de una solicitud aún sin respuesta. */
  neurona: string;
  /** Id del motor de sincronización. */
  sync?: string;
  /** Cuenta que DICE tener: sin servidor no se puede comprobar; sirve para enseñar y enrutar. */
  cuenta?: string;
  nombre: string;
  plataforma?: string;
  medio?: MedioNeurona;
  /** Capacidades anunciadas (etiquetas cortas: vías que escucha, capas compartibles…). */
  capacidades: string[];
}

export type TipoMensajeSync = "sync.solicitud" | "sync.respuesta" | "sync.vinculada" | "sync.cancelada";
const TIPOS: readonly TipoMensajeSync[] = ["sync.solicitud", "sync.respuesta", "sync.vinculada", "sync.cancelada"];

export interface MensajeSync {
  t: TipoMensajeSync;
  v: typeof VERSION_PROTOCOLO;
  /** Id de la solicitud (lo pone quien la inicia y lo repiten todos los mensajes de esa conversación). */
  id: string;
  de: NeuronaSync;
  ts: number;
  /** solicitud: a quién va (vacío = a quien la reciba directamente, p. ej. por su IP). */
  para?: { neurona?: string; sync?: string };
  /** solicitud: hasta cuándo vale. */
  caduca?: number;
  /** solicitud: reconexión automática de un vínculo recordado (nadie pulsó nada). */
  auto?: boolean;
  /** respuesta: sí o no. */
  acepta?: boolean;
  /** solicitud / respuesta / vinculada: el emisor recordará el vínculo. */
  recordar?: boolean;
}

export type EstadoSolicitud =
  | "enviada"
  | "recibida"
  | "aceptada-por-mi"
  | "aceptada-por-el-otro"
  | "vinculada"
  | "rechazada"
  | "caducada"
  | "cancelada";

const TERMINALES: readonly EstadoSolicitud[] = ["vinculada", "rechazada", "caducada", "cancelada"];
export function esTerminal(e: EstadoSolicitud): boolean {
  return TERMINALES.includes(e);
}

export interface SolicitudSync {
  id: string;
  direccion: "saliente" | "entrante";
  estado: EstadoSolicitud;
  /** La otra neurona (en una saliente, lo que se sabe del destino hasta que responde). */
  otro: NeuronaSync;
  /** Huella de la identidad de malla del otro, fijada por el primer mensaje firmado que llega. */
  huellaOtro?: string;
  via: ViaSync | null;
  viaDetalle?: string;
  /** IP de la red local por la que contestar (canal nativo). */
  ip?: string;
  /** Enlace del transporte universal por el que contestar (local:…, cuenta:…, par:…). */
  enlaceId?: string;
  aceptoYo: boolean;
  aceptoOtro: boolean;
  recordarYo: boolean;
  recordarOtro: boolean;
  /** Saliente: la app del destino confirmó que la tiene. */
  entregada: boolean;
  /** Entrante: quien la inició confirmó el vínculo (`sync.vinculada`). */
  confirmada: boolean;
  auto: boolean;
  creada: number;
  actualizada: number;
  caduca: number;
  motivo?: string;
}

export type EventoSolicitud =
  | { tipo: "entregada"; via: ViaSync; detalle?: string }
  | { tipo: "acepto"; recordar: boolean }
  | { tipo: "rechazo" }
  | { tipo: "respuesta"; acepta: boolean; recordar: boolean }
  | { tipo: "confirmada"; recordar?: boolean }
  | { tipo: "recordar"; recordar: boolean }
  | { tipo: "cancelo" }
  | { tipo: "cancela-el-otro" }
  | { tipo: "fallo"; motivo: string }
  | { tipo: "reloj" };

/* ══════════════════════════ Saneado ══════════════════════════ */

const ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;

function idValido(x: unknown): string | undefined {
  return typeof x === "string" && ID_RE.test(x) ? x : undefined;
}

/** Texto corto sin caracteres de control. */
export function textoCorto(x: unknown, max: number): string | undefined {
  if (typeof x !== "string") return undefined;
  const limpio = Array.from(x)
    .map((c) => {
      const n = c.codePointAt(0) ?? 0;
      return n < 32 || n === 127 ? " " : c;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return limpio ? Array.from(limpio).slice(0, max).join("") : undefined;
}

function numero(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function sinVacios<T extends object>(o: T): T {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r as T;
}

/** Lee lo que una neurona dice de sí misma. Null si falta el id de neurona. */
export function leerNeurona(x: unknown): NeuronaSync | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const neurona = idValido(o.neurona);
  if (!neurona) return null;
  const capacidades = Array.isArray(o.capacidades)
    ? o.capacidades.map((c) => textoCorto(c, 48)).filter((c): c is string => !!c).slice(0, 16)
    : [];
  const medio: MedioNeurona | undefined = o.medio === "app-nativa" || o.medio === "navegador" ? (o.medio as MedioNeurona) : undefined;
  return sinVacios({
    neurona,
    sync: idValido(o.sync),
    cuenta: idValido(o.cuenta),
    nombre: textoCorto(o.nombre, 60) ?? "Neurona sin nombre",
    plataforma: textoCorto(o.plataforma, 40),
    medio,
    capacidades,
  });
}

/** Valida y sanea un mensaje del protocolo (ya desenvuelto de su firma). Null si no lo es. */
export function leerMensaje(x: unknown): MensajeSync | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const t = o.t as TipoMensajeSync;
  if (!TIPOS.includes(t) || o.v !== VERSION_PROTOCOLO) return null;
  const id = idValido(o.id);
  const de = leerNeurona(o.de);
  const ts = numero(o.ts);
  if (!id || !de || ts === undefined) return null;
  const m: MensajeSync = { t, v: VERSION_PROTOCOLO, id, de, ts };
  if (t === "sync.solicitud") {
    const p = o.para && typeof o.para === "object" ? (o.para as Record<string, unknown>) : {};
    m.para = sinVacios({ neurona: idValido(p.neurona), sync: idValido(p.sync) });
    const c = numero(o.caduca);
    // Entre 10 s y 10 min desde que se firmó: nadie puede dejar una solicitud viva para siempre.
    m.caduca = c === undefined ? ts + CADUCA_SOLICITUD_MS : Math.min(Math.max(c, ts + 10_000), ts + 10 * 60_000);
    m.auto = o.auto === true;
    m.recordar = o.recordar === true;
  } else if (t === "sync.respuesta") {
    if (typeof o.acepta !== "boolean") return null;
    m.acepta = o.acepta;
    m.recordar = o.recordar === true;
  } else if (t === "sync.vinculada") {
    m.recordar = o.recordar === true;
  }
  return m;
}

/* ══════════════════════════ Mensajes ══════════════════════════ */

export function mensajeSolicitud(p: {
  id: string;
  de: NeuronaSync;
  para: { neurona?: string; sync?: string };
  ahora: number;
  auto?: boolean;
  recordar?: boolean;
  caducaMs?: number;
}): MensajeSync {
  return {
    t: "sync.solicitud",
    v: VERSION_PROTOCOLO,
    id: p.id,
    de: p.de,
    ts: p.ahora,
    para: sinVacios({ neurona: p.para.neurona || undefined, sync: p.para.sync || undefined }),
    caduca: p.ahora + (p.caducaMs ?? CADUCA_SOLICITUD_MS),
    auto: !!p.auto,
    recordar: !!p.recordar,
  };
}

export function mensajeRespuesta(id: string, de: NeuronaSync, acepta: boolean, recordar: boolean, ahora: number): MensajeSync {
  return { t: "sync.respuesta", v: VERSION_PROTOCOLO, id, de, ts: ahora, acepta, recordar };
}

export function mensajeVinculada(id: string, de: NeuronaSync, recordar: boolean, ahora: number): MensajeSync {
  return { t: "sync.vinculada", v: VERSION_PROTOCOLO, id, de, ts: ahora, recordar };
}

export function mensajeCancelada(id: string, de: NeuronaSync, ahora: number): MensajeSync {
  return { t: "sync.cancelada", v: VERSION_PROTOCOLO, id, de, ts: ahora };
}

/** ¿Es para mí una solicitud? Sin destinatario, solo si llegó directa (IP o enlace emparejado). */
export function solicitudParaMi(m: MensajeSync, yo: { neurona: string; sync?: string }, directa: boolean): boolean {
  const p = m.para ?? {};
  if (!p.neurona && !p.sync) return directa;
  return (!!p.neurona && p.neurona === yo.neurona) || (!!p.sync && !!yo.sync && p.sync === yo.sync);
}

/* ══════════════════════════ Máquina de estados ══════════════════════════ */

export function nuevaSaliente(p: {
  id: string;
  otro: NeuronaSync;
  ahora: number;
  recordar?: boolean;
  auto?: boolean;
  /** false: la lanzó un agente en nombre de la persona y ella también tiene que aceptarla. */
  aceptoYo?: boolean;
  caducaMs?: number;
}): SolicitudSync {
  return {
    id: p.id,
    direccion: "saliente",
    estado: "enviada",
    otro: p.otro,
    via: null,
    aceptoYo: p.aceptoYo !== false,
    aceptoOtro: false,
    recordarYo: !!p.recordar,
    recordarOtro: false,
    entregada: false,
    confirmada: false,
    auto: !!p.auto,
    creada: p.ahora,
    actualizada: p.ahora,
    caduca: p.ahora + (p.caducaMs ?? CADUCA_SOLICITUD_MS),
  };
}

/** Solicitud entrante a partir de un `sync.solicitud` ya verificado. Quien la envía ya la aceptó. */
export function nuevaEntrante(
  m: MensajeSync,
  p: { via: ViaSync; viaDetalle?: string; ip?: string; enlaceId?: string; huella?: string; ahora: number },
): SolicitudSync {
  return sinVacios({
    id: m.id,
    direccion: "entrante" as const,
    estado: "recibida" as EstadoSolicitud,
    otro: m.de,
    huellaOtro: p.huella,
    via: p.via,
    viaDetalle: p.viaDetalle,
    ip: p.ip,
    enlaceId: p.enlaceId,
    aceptoYo: false,
    aceptoOtro: true,
    recordarYo: false,
    recordarOtro: !!m.recordar,
    entregada: true,
    confirmada: false,
    auto: !!m.auto,
    creada: p.ahora,
    actualizada: p.ahora,
    caduca: Math.min(m.caduca ?? p.ahora + CADUCA_SOLICITUD_MS, p.ahora + CADUCA_SOLICITUD_MS),
  });
}

/** Estado que se deriva de las banderas (para las no terminales). */
function derivar(s: SolicitudSync): EstadoSolicitud {
  if (s.aceptoYo && s.aceptoOtro && (s.direccion === "saliente" || s.confirmada)) return "vinculada";
  if (s.direccion === "saliente") {
    if (s.aceptoOtro && !s.aceptoYo) return "aceptada-por-el-otro";
    return s.entregada ? "recibida" : "enviada";
  }
  return s.aceptoYo ? "aceptada-por-mi" : "recibida";
}

/**
 * transicion — aplica un evento a una solicitud. Pura: nunca muta la entrada. Las terminales
 * (vinculada, rechazada, caducada, cancelada) ya no cambian. Quien CIERRA el vínculo es quien lo
 * inició (o quien acepta el último en una saliente): la entrante espera su `sync.vinculada`.
 */
export function transicion(s: SolicitudSync, ev: EventoSolicitud, ahora: number): SolicitudSync {
  if (esTerminal(s.estado)) return s;
  const nombre = s.otro.nombre || "La otra neurona";
  let n: SolicitudSync = { ...s, actualizada: ahora };
  switch (ev.tipo) {
    case "reloj":
      if (ahora <= s.caduca) return s;
      return {
        ...n,
        estado: "caducada",
        motivo: s.estado === "aceptada-por-mi" ? `${nombre} no confirmó a tiempo.` : "Nadie respondió a tiempo.",
      };
    case "entregada":
      if (s.direccion !== "saliente") return s;
      n = { ...n, entregada: true, via: ev.via, viaDetalle: ev.detalle ?? s.viaDetalle };
      break;
    case "acepto":
      if (s.aceptoYo) return s;
      n = { ...n, aceptoYo: true, recordarYo: ev.recordar };
      break;
    case "rechazo":
      if (s.aceptoYo) return s;
      return { ...n, estado: "rechazada", motivo: "La rechazaste." };
    case "respuesta":
      if (s.direccion !== "saliente" || s.aceptoOtro) return s;
      if (!ev.acepta) return { ...n, entregada: true, estado: "rechazada", motivo: `${nombre} la rechazó.` };
      n = { ...n, entregada: true, aceptoOtro: true, recordarOtro: ev.recordar };
      break;
    case "confirmada":
      if (s.direccion !== "entrante" || !s.aceptoYo) return s;
      n = { ...n, confirmada: true, recordarOtro: ev.recordar ?? s.recordarOtro };
      break;
    case "recordar":
      return { ...n, recordarYo: ev.recordar };
    case "cancelo":
      return { ...n, estado: "cancelada", motivo: "La cancelaste." };
    case "cancela-el-otro":
      return { ...n, estado: "cancelada", motivo: `${nombre} la canceló.` };
    case "fallo":
      return { ...n, estado: "cancelada", motivo: ev.motivo };
    default:
      return s;
  }
  return { ...n, estado: derivar(n) };
}

/** ¿Esta solicitud espera un gesto de la persona (Aceptar / Rechazar)? */
export function esperaMiRespuesta(s: SolicitudSync): boolean {
  return !esTerminal(s.estado) && !s.aceptoYo;
}

/* ══════════════════════════ Textos ══════════════════════════ */

export function textoVia(via: ViaSync | null, detalle?: string): string {
  if (!via) return "buscando camino…";
  return detalle ? `${ETIQUETA_VIA[via]} · ${detalle}` : ETIQUETA_VIA[via];
}

/** Frase de estado para la interfaz. Siempre dice por qué vía va. */
export function textoEstado(s: SolicitudSync): string {
  const nombre = s.otro.nombre || "La otra neurona";
  const via = textoVia(s.via, s.viaDetalle);
  switch (s.estado) {
    case "enviada":
      return s.via ? `Solicitud enviada por ${via} · esperando respuesta` : "Buscando por dónde llegar…";
    case "recibida":
      return s.direccion === "saliente"
        ? `${nombre} ya tiene tu solicitud (por ${via}) · esperando que acepte`
        : `${nombre} quiere sincronizarse contigo (por ${via})`;
    case "aceptada-por-mi":
      return `Aceptada · esperando la confirmación de ${nombre}`;
    case "aceptada-por-el-otro":
      return `${nombre} aceptó · falta que aceptes tú`;
    case "vinculada":
      return `Vinculadas por ${ETIQUETA_VIA[s.via ?? "red-local-nativa"]}${s.recordarYo ? " · se recordará para futuros encuentros" : ""}`;
    case "rechazada":
    case "caducada":
    case "cancelada":
      return s.motivo ?? (s.estado === "rechazada" ? "Rechazada." : s.estado === "caducada" ? "Caducada." : "Cancelada.");
    default:
      return "";
  }
}

/* ══════════════════════════ Vínculos recordados ══════════════════════════ */

export interface VinculoNeurona {
  neurona: string;
  sync?: string;
  cuenta?: string;
  nombre: string;
  plataforma?: string;
  medio?: MedioNeurona;
  /** Huella de su identidad de malla: una reconexión automática solo vale con LA MISMA. */
  huella?: string;
  /** La recuerdo yo (se reconecta sola y sus solicitudes se aceptan sin preguntar). */
  recordado: boolean;
  /** Ella dijo que me recuerda. */
  recordadoPorElOtro: boolean;
  capacidades: string[];
  creado: number;
  ultimoEncuentro: number;
  ultimaVia: ViaSync | null;
  /** Última IP en la red local (pista para reconectar; nunca viaja a la cuenta). */
  ultimaIp?: string;
}

/** El vínculo que deja una solicitud vinculada (o null si no lo está o no se sabe quién es). */
export function vinculoDeSolicitud(s: SolicitudSync, previo: VinculoNeurona | undefined, ahora: number): VinculoNeurona | null {
  if (s.estado !== "vinculada" || !s.otro.neurona) return null;
  return sinVacios({
    neurona: s.otro.neurona,
    sync: s.otro.sync ?? previo?.sync,
    cuenta: s.otro.cuenta ?? previo?.cuenta,
    nombre: s.otro.nombre || previo?.nombre || "Neurona",
    plataforma: s.otro.plataforma ?? previo?.plataforma,
    medio: s.otro.medio ?? previo?.medio,
    huella: s.huellaOtro ?? previo?.huella,
    recordado: s.recordarYo,
    recordadoPorElOtro: s.recordarOtro,
    capacidades: s.otro.capacidades.length ? s.otro.capacidades : (previo?.capacidades ?? []),
    creado: previo?.creado ?? ahora,
    ultimoEncuentro: ahora,
    ultimaVia: s.via,
    ultimaIp: s.ip ?? previo?.ultimaIp,
  });
}

/** Pone (o sustituye) un vínculo; los más recientes primero, con tope. */
export function ponerVinculo(lista: readonly VinculoNeurona[], v: VinculoNeurona): VinculoNeurona[] {
  return [v, ...lista.filter((x) => x.neurona !== v.neurona)]
    .sort((a, b) => b.ultimoEncuentro - a.ultimoEncuentro)
    .slice(0, MAX_VINCULOS);
}

export function quitarVinculo(lista: readonly VinculoNeurona[], neurona: string): VinculoNeurona[] {
  return lista.filter((x) => x.neurona !== neurona);
}

/**
 * Texto a guardar. Solo los RECORDADOS. Para la cuenta se quita la IP local (dice dónde estaba el
 * aparato en una red concreta: no tiene por qué salir de él).
 */
export function serializarVinculos(lista: readonly VinculoNeurona[], destino: "local" | "cuenta"): string {
  const recordados = lista.filter((v) => v.recordado).map((v) => (destino === "cuenta" ? { ...v, ultimaIp: undefined } : v));
  return JSON.stringify({ v: 1, vinculos: recordados.map((v) => sinVacios({ ...v })) });
}

/** Lee lo guardado (de este aparato o de la cuenta). Lo roto se descarta, nunca lanza. */
export function leerVinculos(texto: string | null | undefined): VinculoNeurona[] {
  if (!texto) return [];
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return [];
  }
  const lista = datos && typeof datos === "object" ? (datos as { vinculos?: unknown }).vinculos : null;
  if (!Array.isArray(lista)) return [];
  const out: VinculoNeurona[] = [];
  for (const x of lista.slice(0, MAX_VINCULOS)) {
    const n = leerNeurona(x);
    if (!n) continue;
    const o = x as Record<string, unknown>;
    const via = typeof o.ultimaVia === "string" && o.ultimaVia in ETIQUETA_VIA ? (o.ultimaVia as ViaSync) : null;
    const ip = typeof o.ultimaIp === "string" && /^\d{1,3}(\.\d{1,3}){3}$/.test(o.ultimaIp) ? o.ultimaIp : undefined;
    out.push(
      sinVacios({
        ...n,
        huella: textoCorto(o.huella, 64),
        recordado: o.recordado === true,
        recordadoPorElOtro: o.recordadoPorElOtro === true,
        creado: numero(o.creado) ?? 0,
        ultimoEncuentro: numero(o.ultimoEncuentro) ?? 0,
        ultimaVia: via,
        ultimaIp: ip,
      }),
    );
  }
  return out;
}

/** Junta lo del aparato con lo de la cuenta: por neurona gana el encuentro más reciente; la IP es del aparato. */
export function fusionarVinculos(local: readonly VinculoNeurona[], cuenta: readonly VinculoNeurona[]): VinculoNeurona[] {
  let lista: VinculoNeurona[] = [...local];
  for (const c of cuenta) {
    const l = lista.find((x) => x.neurona === c.neurona);
    if (!l) lista = ponerVinculo(lista, c);
    else if (c.ultimoEncuentro > l.ultimoEncuentro) lista = ponerVinculo(lista, sinVacios({ ...c, ultimaIp: l.ultimaIp }));
  }
  return [...lista].sort((a, b) => b.ultimoEncuentro - a.ultimoEncuentro);
}

/** Una solicitud de una neurona recordada, con LA MISMA huella, se acepta sin preguntar. */
export function autoAceptable(v: VinculoNeurona | undefined, huella: string | undefined): boolean {
  return !!v && v.recordado && !!v.huella && !!huella && v.huella === huella;
}

/** Limitador de ventanas: como mucho `max` solicitudes por minuto de una misma identidad. */
export function permitirSolicitud(
  historial: readonly number[],
  ahora: number,
  max = MAX_SOLICITUDES_POR_MINUTO,
  ventanaMs = 60_000,
): { permitir: boolean; historial: number[] } {
  const vivos = historial.filter((t) => ahora - t < ventanaMs);
  if (vivos.length >= max) return { permitir: false, historial: vivos };
  return { permitir: true, historial: [...vivos, ahora] };
}

/* ══════════════════════════ Red local (canal nativo) ══════════════════════════ */

/** Espejo de `VecinoLocal` (native/src-tauri/src/malla_local.rs). */
export interface VecinoRedLocal {
  ip: string;
  propia: boolean;
  neurona: string | null;
  tipo: string;
  puerto: number;
  canal: boolean | null;
  visto_hace_s: number;
}

/** Espejo de `EstadoMallaLocal`. */
export interface EstadoRedLocal {
  escuchando: boolean;
  puerto: number;
  motivo: string;
  ultimo_seq: number;
  vecinos: VecinoRedLocal[];
}

/** Espejo de `MensajeLocal` (evento `malla-local://mensaje` y `malla_local_recibidos`). */
export interface MensajeRedLocal {
  seq: number;
  ip: string;
  cuerpo: string;
  recibido_ms: number;
}

/** A quién se pide la sincronización. Basta con UNA identidad que alguna vía alcance. */
export interface DestinoSync {
  neurona?: string;
  sync?: string;
  /** IP en la red local (señal `lan:<ip>`). */
  ip?: string;
  /** Enlace concreto del transporte universal (`local:…`). */
  enlaceId?: string;
  /** Identidad de malla para el relé cifrado. */
  identidadRele?: string;
  nombre?: string;
  cuenta?: string;
}

export function tieneIdentidad(d: DestinoSync): boolean {
  return !!(d.neurona || d.sync || d.ip || d.enlaceId || d.identidadRele);
}

/**
 * candidatosRedLocal — a qué IPs de esta red mandar la solicitud.
 * EXACTOS: la IP pedida, la neurona que el faro reconoce por su id, o la última IP de un vínculo
 * recordado. Sin exactos, PROBABLES: las que no se sabe quiénes son (faros anónimos o de otra
 * cuenta, o de la tuya sin clave de faro) — la solicitud lleva su destinatario y las demás la
 * ignoran. Nunca a una neurona que el faro identifica como OTRA, ni a la IP de otro vínculo.
 */
export function candidatosRedLocal(
  vecinos: readonly VecinoRedLocal[],
  destino: DestinoSync,
  vinculos: readonly VinculoNeurona[] = [],
): { exactos: boolean; lista: VecinoRedLocal[] } {
  const pista = destino.neurona ? vinculos.find((v) => v.neurona === destino.neurona)?.ultimaIp : undefined;
  const exactos = vecinos.filter(
    (v) =>
      (!!destino.ip && v.ip === destino.ip) ||
      (!!destino.neurona && v.neurona === destino.neurona) ||
      (!!pista && v.ip === pista && (!v.neurona || v.neurona === destino.neurona)),
  );
  if (exactos.length) return { exactos: true, lista: unicasPorIp(exactos).slice(0, MAX_CANDIDATOS_LAN) };
  if (destino.ip) {
    // La IP de una señal que ya no se oye: se intenta igual (si no está, la conexión lo dirá).
    return {
      exactos: true,
      lista: [{ ip: destino.ip, propia: false, neurona: destino.neurona ?? null, tipo: "desconocido", puerto: PUERTO_MALLA_LOCAL, canal: null, visto_hace_s: 0 }],
    };
  }
  if (!destino.neurona && !destino.sync) return { exactos: false, lista: [] };
  const ipsDeOtros = new Set(vinculos.filter((v) => v.neurona !== destino.neurona && v.ultimaIp).map((v) => v.ultimaIp as string));
  const probables = vecinos.filter((v) => !v.neurona && v.canal !== false && !ipsDeOtros.has(v.ip));
  return { exactos: false, lista: unicasPorIp(probables).slice(0, MAX_CANDIDATOS_LAN) };
}

function unicasPorIp(l: readonly VecinoRedLocal[]): VecinoRedLocal[] {
  const vistas = new Set<string>();
  return l.filter((v) => (vistas.has(v.ip) ? false : (vistas.add(v.ip), true)));
}

/* ══════════════════════════ Plan de envío ══════════════════════════ */

export type PasoEnvio = "red-local-nativa" | "transporte" | "rele-cuenta";

export interface ContextoEnvio {
  /** Corre dentro de la app nativa (Tauri). */
  nativa: boolean;
  /** IPs candidatas en la red local. */
  candidatosLan: number;
  /** Hay enlaces del transporte universal abiertos (local QR, malla de la cuenta, vínculos). */
  enlacesAbiertos?: number;
  enLinea: boolean;
  sesion: boolean;
}

export interface PlanEnvio {
  pasos: PasoEnvio[];
  /** Frase honesta si ningún paso llega. */
  sinCamino: string;
  /** Ofrecer «Vincular sin internet» (QR): sin internet y sin canal nativo. */
  ofrecerQr: boolean;
}

/**
 * planDeEnvio — orden de las vías: 1) canal local nativo si hay neuronas en esta red, 2) transporte
 * universal (enlace local por QR, malla P2P de la cuenta, vínculo entre cuentas, relé con identidad),
 * 3) relé de la cuenta si hay internet y sesión (llega aunque no haya enlace P2P abierto).
 */
export function planDeEnvio(c: ContextoEnvio): PlanEnvio {
  const pasos: PasoEnvio[] = [];
  if (c.nativa && c.candidatosLan > 0) pasos.push("red-local-nativa");
  pasos.push("transporte");
  if (c.enLinea && c.sesion) pasos.push("rele-cuenta");
  const lan = c.nativa && c.candidatosLan > 0;
  return { pasos, sinCamino: motivoSinCamino(c), ofrecerQr: !c.enLinea && !lan };
}

export function motivoSinCamino(c: ContextoEnvio): string {
  if (!c.nativa && !c.enLinea) {
    return "Sin internet, un navegador no puede descubrir otra neurona por sí solo. Vinculadlas con «Vincular sin internet» (código QR) o abrid la app nativa de StarSeed OS en los dos aparatos.";
  }
  if (c.nativa && c.candidatosLan === 0 && !c.enLinea) {
    return "La app nativa no oye ninguna otra neurona en esta red: la otra tiene que tener la app abierta o en segundo plano, en el mismo Wi-Fi y sin aislamiento de clientes. También podéis vincularlas con «Vincular sin internet».";
  }
  if (c.enLinea && !c.sesion) {
    return "Sin sesión iniciada no hay relé de la cuenta, y no hay ningún enlace directo abierto con esa neurona.";
  }
  return "No hay ningún camino abierto hacia esa neurona ahora mismo: ni en esta red, ni enlace directo, ni relé que le llegue.";
}

/** Vía de un mensaje que entró por el transporte universal. */
export function viaDeOrigen(origen: { tipo: string; enlaceId?: string }): ViaSync {
  if (origen.enlaceId?.startsWith("nativo:")) return "red-local-nativa";
  switch (origen.tipo) {
    case "local":
      return "enlace-local";
    case "cuenta":
      return "malla-cuenta";
    case "par":
      return "vinculo-par";
    case "lora":
      return "lora";
    default:
      return "rele";
  }
}

/** Vía de un tipo de enlace del transporte universal (`TipoEnlace`). */
export function viaDeTipoEnlace(tipo: string | null | undefined): ViaSync | null {
  if (!tipo) return null;
  return viaDeOrigen({ tipo });
}

/* ══════════════════════════ Señales del radar ══════════════════════════ */

type SenalMinima = Pick<DetectedSignal, "id" | "label" | "starseed">;

/** A quién pedir la sincronización desde una señal del radar. Null si la señal no dice quién es. */
export function destinoDeSenal(s: SenalMinima): DestinoSync | null {
  const st = s.starseed;
  const nombre = st?.name || s.label || undefined;
  let d: DestinoSync | null = null;
  if (s.id.startsWith("lan:")) {
    d = { ip: s.id.slice(4), neurona: st?.neuronId, sync: st?.syncDeviceId, nombre };
  } else if (s.id.startsWith("local:")) {
    const enlaceId = st?.sourceId?.startsWith("local:") ? st.sourceId : s.id;
    d = { enlaceId, neurona: st?.neuronId, sync: st?.syncDeviceId, nombre };
  } else if (st?.via === "neuron-registry") {
    d = { neurona: st.sourceId, sync: st.syncDeviceId, nombre };
  } else if (st?.via === "relay-beacon" || st?.via === "federation") {
    d = { neurona: st.neuronId, sync: st.syncDeviceId, identidadRele: st.sourceId, nombre };
  } else if (st?.via === "direct-link") {
    d = { enlaceId: st.sourceId, neurona: st.neuronId, sync: st.syncDeviceId, nombre };
  }
  if (!d) return null;
  const limpio = sinVacios({ ...d });
  return tieneIdentidad(limpio) ? limpio : null;
}

/** Neurona a la que corresponde un vecino: la que dice su faro o la del vínculo que estaba en esa IP. */
export function neuronaDeVecino(v: VecinoRedLocal, vinculos: readonly VinculoNeurona[]): VinculoNeurona | undefined {
  if (v.neurona) return vinculos.find((x) => x.neurona === v.neurona);
  return vinculos.find((x) => x.ultimaIp === v.ip);
}

/**
 * senalesRedLocal — las neuronas que la app nativa oye por faro, como señales del radar, para poder
 * pulsar «Sincronizar ahora» sin internet. Se omiten las que ya están en el radar como neurona de la
 * cuenta (`presentes`: ids de neurona ya pintados).
 */
export function senalesRedLocal(
  vecinos: readonly VecinoRedLocal[],
  vinculos: readonly VinculoNeurona[],
  ahora: number,
  presentes: ReadonlySet<string> = new Set(),
): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  for (const v of unicasPorIp(vecinos)) {
    const vin = neuronaDeVecino(v, vinculos);
    const neurona = v.neurona ?? vin?.neurona;
    if (neurona && presentes.has(neurona)) continue;
    const id = `lan:${v.ip}`;
    const visto = ahora - Math.max(0, v.visto_hace_s) * 1000;
    const quality = qualityFromAge(Math.max(0, v.visto_hace_s) * 1000, 60_000);
    const nombre = vin?.nombre ?? null;
    out.push({
      id,
      antenna: "ip",
      antennaLabel: ANTENNA_LABEL.ip,
      signalType: "Faro StarSeed · red local (app nativa)",
      label: nombre ?? (v.propia ? "Neurona de tu cuenta en esta red" : "Neurona StarSeed en esta red"),
      detail:
        "La app nativa oye su faro en esta red, sin internet. Quién es exactamente se confirma al sincronizar: la solicitud y la respuesta van firmadas.",
      quality,
      qualityDetail: "Sin radiofrecuencia: la calidad es la frescura de su faro UDP (cada 15 s; deja de contar a los 60 s).",
      metrics: [
        { label: "Dirección en esta red", value: v.ip },
        { label: "Tipo de aparato", value: v.tipo },
        { label: "Último faro", value: `hace ${Math.max(0, v.visto_hace_s)} s` },
        {
          label: "Canal local",
          value: v.canal === false ? "su app es anterior: sin canal local" : v.canal ? `TCP ${v.puerto}` : `TCP ${v.puerto} (sin confirmar)`,
        },
        ...(vin ? [{ label: "Vínculo", value: vin.recordado ? "recordado" : "de esta sesión" }] : []),
      ],
      compatible: v.canal !== false,
      compatDetail:
        v.canal === false
          ? "Su app nativa aún no trae el canal local: actualízala para sincronizar sin internet."
          : "Habla el protocolo de la malla de StarSeed: la solicitud le llega al instante por la red local.",
      starseed: {
        via: "direct-link",
        sourceId: id,
        neuronId: neurona,
        name: nombre,
        ownAccount: v.propia,
        deviceKind: v.tipo,
        online: true,
        lastSeenMs: visto,
        capabilities: vin?.capacidades ?? [],
        syncDeviceId: vin?.sync,
      },
      placement: placeBySector("ip", id, quality),
      lastHeard: visto,
      actions: [
        {
          id: "sync-now",
          label: "Sincronizar ahora",
          enabled: v.canal !== false,
          hint:
            v.canal === false
              ? "Su app no tiene canal local todavía."
              : vin?.recordado
                ? "Vínculo recordado: se acepta solo en la otra neurona."
                : "Le aparece al instante una ventana para aceptar.",
        },
      ],
      simulated: false,
      color: ANTENNA_COLOR.ip,
    });
  }
  return out;
}

/* ══════════════════════════ Reconexión automática ══════════════════════════ */

export interface Reconexion {
  vinculo: VinculoNeurona;
  ip: string;
  puerto: number;
}

/**
 * reconexionesPendientes — vínculos recordados que REAPARECEN en esta red (no estaban en la vuelta
 * anterior) y a los que no se ha intentado reconectar en el último minuto, sin solicitud en curso.
 * Devuelve también quiénes están presentes ahora (para la vuelta siguiente).
 */
export function reconexionesPendientes(p: {
  vinculos: readonly VinculoNeurona[];
  vecinos: readonly VecinoRedLocal[];
  presentesAntes: ReadonlySet<string>;
  ultimosIntentos: Readonly<Record<string, number>>;
  enCurso: ReadonlySet<string>;
  ahora: number;
}): { reconectar: Reconexion[]; presentes: Set<string> } {
  const presentes = new Set<string>();
  const reconectar: Reconexion[] = [];
  for (const v of p.vinculos) {
    if (!v.recordado) continue;
    const vecino =
      p.vecinos.find((x) => x.neurona === v.neurona) ??
      (v.ultimaIp ? p.vecinos.find((x) => x.ip === v.ultimaIp && !x.neurona) : undefined);
    if (!vecino || vecino.canal === false) continue;
    presentes.add(v.neurona);
    if (p.presentesAntes.has(v.neurona) || p.enCurso.has(v.neurona)) continue;
    if (p.ahora - (p.ultimosIntentos[v.neurona] ?? 0) < REINTENTO_RECONEXION_MS) continue;
    reconectar.push({ vinculo: v, ip: vecino.ip, puerto: vecino.puerto || PUERTO_MALLA_LOCAL });
  }
  return { reconectar, presentes };
}

/* ══════════════════════════ API para el panel del vínculo ══════════════════════════ */

export interface LatenciaVia {
  via: ViaSync;
  disponible: boolean;
  /** Ida y vuelta medida (ping de esa vía o acuse del último mensaje); null = sin medir. */
  latenciaMs: number | null;
  medidoEn: number | null;
  detalle: string;
}

export interface SincronizacionResumen {
  id: string;
  direccion: SolicitudSync["direccion"];
  estado: EstadoSolicitud;
  via: ViaSync | null;
  auto: boolean;
  desde: number;
  actualizada: number;
  texto: string;
}

/** Lo que hay ahora mismo hacia una neurona, por vía. */
export interface DisponibilidadVias {
  redLocal?: { ip: string; canal: boolean | null } | null;
  enlaceLocal?: { id: string; rttMs: number | null } | null;
  mallaCuenta?: { id: string; rttMs: number | null } | null;
  vinculoPar?: { id: string; rttMs: number | null } | null;
  rele: boolean;
}

export type MedidasVias = Partial<Record<ViaSync, { ms: number; at: number }>>;

/** Las vías hacia un vínculo, con su latencia (medida por ping si la hay; si no, la del propio enlace). */
export function viasDeVinculo(d: DisponibilidadVias, medidas: MedidasVias = {}): LatenciaVia[] {
  const fila = (via: ViaSync, disponible: boolean, rttEnlace: number | null | undefined, detalle: string): LatenciaVia => {
    const m = medidas[via];
    const latenciaMs = m ? m.ms : typeof rttEnlace === "number" && Number.isFinite(rttEnlace) ? rttEnlace : null;
    return { via, disponible, latenciaMs, medidoEn: m ? m.at : null, detalle };
  };
  return [
    fila(
      "red-local-nativa",
      !!d.redLocal && d.redLocal.canal !== false,
      null,
      d.redLocal ? `oída por faro en ${d.redLocal.ip}${d.redLocal.canal === false ? " (su app no tiene canal local)" : ""}` : "no se oye en esta red (o falta la app nativa)",
    ),
    fila("enlace-local", !!d.enlaceLocal, d.enlaceLocal?.rttMs, d.enlaceLocal ? "emparejadas por código/QR" : "sin enlace por código/QR"),
    fila("malla-cuenta", !!d.mallaCuenta, d.mallaCuenta?.rttMs, d.mallaCuenta ? "canal WebRTC de la cuenta abierto" : "sin canal P2P de la cuenta"),
    fila("vinculo-par", !!d.vinculoPar, d.vinculoPar?.rttMs, d.vinculoPar ? "vínculo entre cuentas conectado" : "sin vínculo entre cuentas"),
    fila("rele", d.rele, null, d.rele ? "con internet y sesión: llega cuando consulte el relé (sin latencia medible)" : "sin internet o sin sesión"),
  ];
}

/** Las sincronizaciones (solicitudes) con una neurona, la más reciente primero. */
export function sincronizacionesDe(neurona: string, solicitudes: readonly SolicitudSync[]): SincronizacionResumen[] {
  return solicitudes
    .filter((s) => s.otro.neurona === neurona)
    .sort((a, b) => b.actualizada - a.actualizada)
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      direccion: s.direccion,
      estado: s.estado,
      via: s.via,
      auto: s.auto,
      desde: s.creada,
      actualizada: s.actualizada,
      texto: textoEstado(s),
    }));
}
