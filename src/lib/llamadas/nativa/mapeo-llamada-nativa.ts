/*
 * mapeo-llamada-nativa — el estado de la llamada de StarSeed ↔ el estado de la llamada del teléfono
 * (LLA1108D, 2026-11-08). Contrato: architecture/llamadas-telefonia.md § «Integración nativa».
 *
 * MÓDULO PURO (sin DOM, sin Tauri, sin motor): solo traduce.
 *  · de lo que cuentan los dos motores (la llamada directa por la malla y el sistema de llamadas por
 *    canal) a «sonando / activa / en-espera / terminada» con su id, nombre y tipo;
 *  · de un evento del teléfono (contestar, rechazar, colgar, silenciar…) a la acción que el motor ya sabe
 *    hacer, mirando qué llamada hay ahora (nunca actúa sobre una llamada que no es la que dijo el evento).
 * Quien ejecuta (puente-llamada-nativa.ts) inyecta los motores; aquí no se importa ninguno.
 */

export type EstadoNativo = "sonando" | "activa" | "en-espera" | "terminada";
export type RutaAudio = "auricular" | "altavoz" | "cableado" | "bluetooth";
export type TipoNativo = "voz" | "video";
export type EventoNativo = "contestar" | "rechazar" | "colgar" | "silenciar" | "ruta" | "proximidad" | "espera";

export const ESTADOS_NATIVOS: readonly EstadoNativo[] = ["sonando", "activa", "en-espera", "terminada"];
export const RUTAS_AUDIO: readonly RutaAudio[] = ["auricular", "altavoz", "cableado", "bluetooth"];
export const EVENTOS_NATIVOS: readonly EventoNativo[] = ["contestar", "rechazar", "colgar", "silenciar", "ruta", "proximidad", "espera"];
export const PREFIJO_EVENTO = "llamada-nativa://";

/** Lo que Rust necesita saber de una llamada. */
export interface LlamadaParaNativa {
  id: string;
  nombre: string;
  tipo: TipoNativo;
  entrante: boolean;
  estado: EstadoNativo;
  /** El micrófono está cerrado (para el texto «Activar micrófono» del aviso). */
  silenciada: boolean;
}

/* ══════════════════════════ De los motores al teléfono ══════════════════════════ */

/** Lo mínimo de `EstadoLlamadaDirecta` que se mira. */
export interface VistaDirecta {
  fase: "inactiva" | "llamando" | "entrante" | "en-curso" | "terminada";
  id: string | null;
  nombre: string;
  video: boolean;
  micro: boolean;
  entrante: boolean;
}

/** La llamada directa (malla) como llamada del teléfono; null si no hay nada que contar. */
export function llamadaDesdeDirecta(e: VistaDirecta): LlamadaParaNativa | null {
  if (!e.id) return null;
  const estado: EstadoNativo | null =
    e.fase === "llamando" || e.fase === "entrante" ? "sonando" : e.fase === "en-curso" ? "activa" : e.fase === "terminada" ? "terminada" : null;
  if (!estado) return null;
  return { id: e.id, nombre: e.nombre || "StarSeed", tipo: e.video ? "video" : "voz", entrante: e.entrante, estado, silenciada: !e.micro };
}

/** Lo mínimo de una llamada del sistema de llamadas (por canal). */
export interface VistaActiva {
  sesionId: string;
  tipo: string;
  titulo: string;
  esCreador: boolean;
  /** Fase del motor: preparando, conectando, esperando, en-curso, llena, terminada, error… */
  fase: string;
  micro: boolean;
}

export interface VistaTimbre {
  sesionId: string;
  tipo: string;
  nombre: string;
}

function tipoDe(t: string): TipoNativo {
  return t === "video" || t === "sala-vr" || t === "sala-ar" ? "video" : "voz";
}

/**
 * La llamada del sistema de llamadas como llamada del teléfono. Un timbre sin contestar suena; una llamada
 * activa suena mientras quien la creó espera a que alguien entre y está activa cuando ya hay conversación
 * (o cuando eres tú quien contestó).
 */
export function llamadaDesdeSistema(activa: VistaActiva | null, timbres: readonly VistaTimbre[]): LlamadaParaNativa | null {
  if (activa) {
    const fin = activa.fase === "terminada" || activa.fase === "error";
    const conversando = activa.fase === "en-curso" || activa.fase === "llena";
    const estado: EstadoNativo = fin ? "terminada" : conversando || !activa.esCreador ? "activa" : "sonando";
    return { id: activa.sesionId, nombre: activa.titulo || "StarSeed", tipo: tipoDe(activa.tipo), entrante: !activa.esCreador, estado, silenciada: !activa.micro };
  }
  const t = timbres[0];
  if (!t) return null;
  return { id: t.sesionId, nombre: t.nombre || "StarSeed", tipo: tipoDe(t.tipo), entrante: true, estado: "sonando", silenciada: false };
}

/** Lo último que se le contó a Rust de la llamada. */
export interface UltimoContado {
  id: string;
  estado: EstadoNativo;
  silenciada: boolean;
}

/** Qué hay que decirle a Rust para pasar de la última llamada contada a la de ahora. */
export type PasoNativo =
  | { paso: "iniciar"; llamada: LlamadaParaNativa }
  | { paso: "estado"; id: string; estado: EstadoNativo; silenciada: boolean };

/** Pura: los pasos (en orden) que llevan de lo contado a lo de ahora. Sin cambios, ninguno. */
export function pasosHacia(anterior: UltimoContado | null, ahora: LlamadaParaNativa | null): PasoNativo[] {
  const abierta = !!anterior && anterior.estado !== "terminada";
  if (!ahora) {
    // La llamada desapareció sin decir «terminada»: se cierra lo nativo.
    return anterior && abierta ? [{ paso: "estado", id: anterior.id, estado: "terminada", silenciada: false }] : [];
  }
  const pasos: PasoNativo[] = [];
  const misma = anterior?.id === ahora.id;
  if (anterior && !misma && abierta) pasos.push({ paso: "estado", id: anterior.id, estado: "terminada", silenciada: false });
  if (ahora.estado === "terminada") {
    // Una llamada que acabó sin haberse contado nunca no se cuenta ahora.
    if (misma && abierta) pasos.push({ paso: "estado", id: ahora.id, estado: "terminada", silenciada: false });
    return pasos;
  }
  if (!misma || !abierta) {
    pasos.push({ paso: "iniciar", llamada: ahora });
    if (ahora.estado !== "sonando") pasos.push({ paso: "estado", id: ahora.id, estado: ahora.estado, silenciada: ahora.silenciada });
    return pasos;
  }
  if (anterior && (anterior.estado !== ahora.estado || anterior.silenciada !== ahora.silenciada)) {
    pasos.push({ paso: "estado", id: ahora.id, estado: ahora.estado, silenciada: ahora.silenciada });
  }
  return pasos;
}

/** Lo contado tras ejecutar los pasos (null si la llamada acabó). Pura. */
export function contadoTras(anterior: UltimoContado | null, pasos: readonly PasoNativo[]): UltimoContado | null {
  let c = anterior;
  for (const p of pasos) {
    if (p.paso === "iniciar") c = { id: p.llamada.id, estado: "sonando", silenciada: p.llamada.silenciada };
    else c = p.estado === "terminada" ? null : { id: p.id, estado: p.estado, silenciada: p.silenciada };
  }
  return c;
}

/* ══════════════════════════ Del teléfono a los motores ══════════════════════════ */

/** Lo que llega con un evento (`{ id, valor }`). Se valida: viene de fuera de la web. */
export interface CargaEvento {
  id: string;
  valor: unknown;
}

export function cargaDeEvento(raw: unknown): CargaEvento | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { id?: unknown; valor?: unknown };
  if (typeof o.id !== "string" || !o.id || o.id.length > 80) return null;
  return { id: o.id, valor: o.valor ?? null };
}

export function eventoDeNombre(nombre: string): EventoNativo | null {
  if (!nombre.startsWith(PREFIJO_EVENTO)) return null;
  const e = nombre.slice(PREFIJO_EVENTO.length);
  return (EVENTOS_NATIVOS as readonly string[]).includes(e) ? (e as EventoNativo) : null;
}

/** Qué hay en marcha ahora en los dos motores (para decidir a quién va el evento). */
export interface InstantaneaMotores {
  directa: { fase: VistaDirecta["fase"]; id: string | null; micro: boolean } | null;
  activa: { sesionId: string; micro: boolean; cerrada: boolean } | null;
  timbres: readonly { sesionId: string }[];
}

/** La acción que el motor ya sabe hacer. */
export type AccionMotor =
  | { motor: "directa"; accion: "contestar" | "rechazar" | "colgar" | "silenciar" }
  | { motor: "sistema"; accion: "contestar" | "rechazar"; sesionId: string }
  | { motor: "sistema"; accion: "colgar" | "silenciar" };

/**
 * Un evento del teléfono → la acción del motor. Solo actúa si el evento habla de la llamada que hay:
 *  · contestar/rechazar: la llamada directa que SUENA aquí (entrante) o el timbre del sistema con ese id;
 *  · colgar: la llamada directa viva o la llamada activa del sistema con ese id;
 *  · silenciar (`valor` true/false): solo si cambia algo (si ya está así, no se alterna).
 * ruta, proximidad y espera son del teléfono: no tocan el motor.
 */
export function accionParaEvento(evento: EventoNativo, carga: CargaEvento, m: InstantaneaMotores): AccionMotor | null {
  const d = m.directa;
  const directaViva = !!d && d.id === carga.id && (d.fase === "llamando" || d.fase === "entrante" || d.fase === "en-curso");
  const directaSuena = !!d && d.id === carga.id && d.fase === "entrante";
  const timbre = m.timbres.find((t) => t.sesionId === carga.id);
  const activa = m.activa && m.activa.sesionId === carga.id && !m.activa.cerrada ? m.activa : null;
  switch (evento) {
    case "contestar":
      if (directaSuena) return { motor: "directa", accion: "contestar" };
      if (timbre) return { motor: "sistema", accion: "contestar", sesionId: timbre.sesionId };
      return null;
    case "rechazar":
      if (directaSuena) return { motor: "directa", accion: "rechazar" };
      if (timbre) return { motor: "sistema", accion: "rechazar", sesionId: timbre.sesionId };
      // Rechazar una llamada que ya contestaste es colgar.
      if (directaViva) return { motor: "directa", accion: "colgar" };
      if (activa) return { motor: "sistema", accion: "colgar" };
      return null;
    case "colgar":
      if (directaViva) return { motor: "directa", accion: "colgar" };
      if (timbre) return { motor: "sistema", accion: "rechazar", sesionId: timbre.sesionId };
      if (activa) return { motor: "sistema", accion: "colgar" };
      return null;
    case "silenciar": {
      if (typeof carga.valor !== "boolean") return null;
      const quiereSilencio = carga.valor;
      if (directaViva && d) return quiereSilencio === !d.micro ? null : { motor: "directa", accion: "silenciar" };
      if (activa && m.activa) return quiereSilencio === !m.activa.micro ? null : { motor: "sistema", accion: "silenciar" };
      return null;
    }
    default:
      return null;
  }
}

/* ══════════════════════════ Lo que enseña el hook ══════════════════════════ */

export interface CapacidadesLlamadaNativa {
  plataforma: string;
  nativa: boolean;
  telecom: boolean;
  notificaciones: boolean;
  /** «concedido» | «denegado» | «no-aplica». */
  pantalla_completa: string;
  proximidad: boolean;
  rutas: RutaAudio[];
  ruta: RutaAudio | "";
  evita_suspension: boolean;
  motivo: string;
}

export const SIN_CAPACIDADES: CapacidadesLlamadaNativa = {
  plataforma: "web",
  nativa: false,
  telecom: false,
  notificaciones: false,
  pantalla_completa: "no-aplica",
  proximidad: false,
  rutas: [],
  ruta: "",
  evita_suspension: false,
  motivo: "",
};

export function esRuta(x: unknown): x is RutaAudio {
  return typeof x === "string" && (RUTAS_AUDIO as readonly string[]).includes(x);
}

/** Normaliza lo que contesta Rust (nunca lanza; lo raro queda como «sin capacidades»). */
export function leerCapacidades(raw: unknown): CapacidadesLlamadaNativa {
  if (!raw || typeof raw !== "object") return SIN_CAPACIDADES;
  const o = raw as Record<string, unknown>;
  const rutas = Array.isArray(o.rutas) ? o.rutas.filter(esRuta) : [];
  return {
    plataforma: typeof o.plataforma === "string" ? o.plataforma : "desconocida",
    nativa: o.nativa === true,
    telecom: o.telecom === true,
    notificaciones: o.notificaciones === true,
    pantalla_completa: typeof o.pantalla_completa === "string" ? o.pantalla_completa : "no-aplica",
    proximidad: o.proximidad === true,
    rutas,
    ruta: esRuta(o.ruta) ? o.ruta : "",
    evita_suspension: o.evita_suspension === true,
    motivo: typeof o.motivo === "string" ? o.motivo : "",
  };
}

/** ¿La pantalla completa sobre el bloqueo está bien (o no hace falta)? */
export function pantallaCompletaLista(c: CapacidadesLlamadaNativa): boolean {
  return c.pantalla_completa === "concedido" || c.pantalla_completa === "no-aplica";
}
