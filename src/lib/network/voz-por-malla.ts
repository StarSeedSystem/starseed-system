"use client";

/**
 * voz-por-malla — oído y voz de Astraura a otra neurona (Ola 1015V · R).
 * Protocolo `oido.*` y `voz.*` sobre el canal P2P de la malla. Toma el modelo
 * de `ia-por-malla.ts` (id, cancelar, error, una petición por par) y de
 * `archivos-malla.ts` (trozos de 16 KB con sha256). El audio SOLO va a tus
 * neuronas o al servidor de la sesión de tu grupo; al resto de la red viaja
 * texto (§3 del contrato). Ninguna función de esta capa lanza.
 */

export const VOZ_MALLA_MAX_BYTES = 24 * 1024;
export const TROZO_AUDIO_BYTES = 16 * 1024;

/** De dónde es el destino del audio: propia, de la sesión de grupo, o ajena. */
export type ConfianzaVoz = "propia" | "grupo" | "ajena";

/** Destino del audio; `enSesion` = pertenece al grupo o llamada en curso. */
export interface DestinoVoz { dispositivo: string; confianza: ConfianzaVoz; enSesion?: boolean }

/** Un trozo de audio en base64, con su orden y su sha256. */
export interface TrozoAudio { i: number; total: number; datosB64: string; sha256: string }

export interface MsgOidoPedir {
  t: "oido.pedir"; id: string; idioma?: string; hotwords?: string[]; audio: TrozoAudio;
}
export interface MsgOidoTexto {
  t: "oido.texto"; id: string; texto: string; tipo: "parcial" | "final"; motor?: string;
}
export interface MsgVozPedir {
  t: "voz.pedir"; id: string; texto: string; idioma?: string;
  timbre: { id: string; nombre?: string; genero?: string };
}
export interface MsgVozTrozo { t: "voz.trozo"; id: string; audio: TrozoAudio }
export interface MsgVozCancelar { t: "oido.cancelar" | "voz.cancelar"; id: string }
export interface MsgVozError { t: "oido.error" | "voz.error"; id: string; estado: number; mensaje: string }

export type VozMallaMsg =
  | MsgOidoPedir | MsgOidoTexto | MsgVozPedir | MsgVozTrozo | MsgVozCancelar | MsgVozError;

export interface TransporteVozMalla { enviar(peerId: string, json: string): boolean }
/** Deps del despachador: transporte inyectado, privacidad y peticiones por par. */
export interface DepsDespachadorVoz {
  transporte: TransporteVozMalla;
  autorizar?: (destino: DestinoVoz) => boolean;
  enVuelo?: Map<string, string>;
}
function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object"; }
function esTrozo(x: unknown): x is TrozoAudio {
  return esObjeto(x) && Number.isInteger(x.i) && Number.isInteger(x.total) && typeof x.datosB64 === "string" && typeof x.sha256 === "string";
}
export function esMensajeVozMalla(x: unknown): x is VozMallaMsg {
  if (!esObjeto(x) || typeof x.id !== "string" || !x.id || typeof x.t !== "string") return false;
  switch (x.t) {
    case "oido.pedir": return esTrozo(x.audio) && (x.idioma === undefined || typeof x.idioma === "string") && (x.hotwords === undefined || (Array.isArray(x.hotwords) && x.hotwords.every((h) => typeof h === "string")));
    case "oido.texto": return typeof x.texto === "string" && (x.tipo === "parcial" || x.tipo === "final");
    case "voz.pedir": return typeof x.texto === "string" && esObjeto(x.timbre) && typeof x.timbre.id === "string";
    case "voz.trozo": return esTrozo(x.audio);
    case "oido.cancelar": case "voz.cancelar": return true;
    case "oido.error": case "voz.error": return typeof x.estado === "number" && typeof x.mensaje === "string";
    default: return false;
  }
}
export function bytesAB64(d: Uint8Array): string {
  let s = ""; for (const b of d) s += String.fromCharCode(b);
  try { return btoa(s); } catch { return ""; }
}
export function b64ABytes(b: string): Uint8Array {
  try { return Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); } catch { return new Uint8Array(0); }
}
export async function sha256Hex(d: Uint8Array): Promise<string> {
  try {
    const h = await globalThis.crypto.subtle.digest("SHA-256", d.slice().buffer as ArrayBuffer);
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}
/** Trocea audio crudo en partes de 16 KB, cada una con su sha256. Nunca lanza. */
export async function trocearAudio(datos: Uint8Array): Promise<TrozoAudio[]> {
  const total = Math.max(1, Math.ceil(datos.length / TROZO_AUDIO_BYTES)), lista: TrozoAudio[] = [];
  for (let i = 0; i < total; i++) {
    const parte = datos.subarray(i * TROZO_AUDIO_BYTES, (i + 1) * TROZO_AUDIO_BYTES);
    lista.push({ i, total, datosB64: bytesAB64(parte), sha256: await sha256Hex(parte) });
  }
  return lista;
}
/** Rearma y valida ORDEN (i consecutivo, mismo total). `null` si no cuadra. Pura. */
export function rearmarAudio(trozos: TrozoAudio[]): Uint8Array | null {
  if (!trozos.length) return null;
  const total = trozos[0].total;
  if (total !== trozos.length || trozos.some((t, i) => !t || t.i !== i || t.total !== total)) return null;
  const partes = trozos.map((t) => b64ABytes(t.datosB64));
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
/** Valida sha256 de cada trozo además del orden. `false` si algo no cuadra. */
export async function validarTrozos(trozos: TrozoAudio[]): Promise<boolean> {
  if (!rearmarAudio(trozos)) return false;
  for (const t of trozos) if ((await sha256Hex(b64ABytes(t.datosB64))) !== t.sha256) return false;
  return true;
}
/** §3: el audio solo va a tus neuronas (propia) o al servidor de tu sesión de grupo. */
export function puedeEnviarAudio(d: DestinoVoz): boolean {
  return d.confianza === "propia" || (d.confianza === "grupo" && d.enSesion === true);
}
const enVueloProduccion = new Map<string, string>();
/** Despacha un mensaje por el transporte inyectado. Valida privacidad, tamaño y 1 por par. */
export function despacharVozMalla(msg: VozMallaMsg, destino: DestinoVoz, deps: DepsDespachadorVoz): boolean {
  try {
    if (!esMensajeVozMalla(msg)) return false;
    if ((msg.t === "oido.pedir" || msg.t === "voz.trozo") && !(deps.autorizar ?? puedeEnviarAudio)(destino)) return false;
    const pide = msg.t === "oido.pedir" || msg.t === "voz.pedir";
    const enVuelo = deps.enVuelo ?? enVueloProduccion;
    if (pide && enVuelo.has(destino.dispositivo) && enVuelo.get(destino.dispositivo) !== msg.id) return false;
    if (pide) enVuelo.set(destino.dispositivo, msg.id); else enVuelo.delete(destino.dispositivo);
    const json = JSON.stringify(msg);
    return new TextEncoder().encode(json).length <= VOZ_MALLA_MAX_BYTES && deps.transporte.enviar(destino.dispositivo, json);
  } catch { return false; }
}

/* ── VST1018K · manejadores PUROS de las capacidades `voz.hablar` y `oido.transcribir` del relé ──
 * `capacidad.*` (capacidad-por-malla.ts, tipos `voz` y `oido`). La neurona que sirve admite solo
 * peticiones de su misma cuenta o de la sesión de grupo que comparte; el audio de un tercero exige
 * permiso registrado (clonacion.ts) y el motor se elige con licencia por contexto (catalogo-voces:
 * nada «personal» por defecto ni fuera de lo personal; sin AudioSeal una voz clonada no sale de lo
 * personal). Contrato: architecture/voz-voicestudio.md §3–§4. Todo inyectado, sin red ni reloj. */
import { puedeClonar, type PermisoVoz, type UsoVoz } from "@/lib/aurora/voz-starseed/clonacion";
import { MOTORES_VOZ, motorRecomendado, type MotorVozCatalogo, type Plataforma } from "@/lib/aurora/catalogo-voces";
import { MOTORES_OIDO, elegirOido, type MotorOidoId } from "@/lib/aurora/stt-oss/motores-oido";

/** Respuesta de un manejador: el motor con su motivo, o un rechazo legible. */
export type PlanVozMalla =
  | { ok: true; motor: string; motivo: string }
  | { ok: false; motivo: string };

/** Qué pide y desde dónde: cuerpo de `capacidad.pedir` (tipo `voz` u `oido`). */
export interface PeticionVozMallaCuerpo {
  /** Cuenta de quien pide; solo se compara, no se valida aquí. */
  cuenta: string;
  /** Sesión de grupo desde la que pide (debe ser la que esta neurona comparte). */
  grupo?: string;
  /** Contexto de licencia; por defecto «personal», nunca se infiere uno más antojadizo. */
  uso?: UsoVoz;
  /** Cuenta dueña de la voz; si es otra, hace falta permiso y motor que clone. */
  vozTitular?: string;
  /** Idioma del audio que se transcribe (el elector de oído lo usa). */
  idioma?: string;
  motorPreferido?: string;
}

/** Neurona que sirve: su cuenta, el grupo que acepta, permisos y medidas, todo inyectado. */
export interface ContextoServidaVoz {
  cuentaLocal: string;
  sesionGrupo?: string | null;
  permisos: PermisoVoz[];
  /** Reloj inyectado (ms) para juzgar la validez de los permisos. */
  ahora: number;
  plataforma: Plataforma;
  ramGB: number;
  /** Oídos medidos como disponibles en esta neurona. */
  oidoDisponibles: MotorOidoId[];
  fase?: "parcial" | "final";
  /** Motores «condicionada» cuya condición se cumple aquí (vigia-modelos.md). */
  condicionesCumplidas?: string[];
  /** ¿AudioSeal disponible? Sin marca de agua, una voz clonada no sale de lo personal. */
  marcaAguaDisponible?: boolean;
}

/** Admisión: misma cuenta o la sesión de grupo que esta neurona comparte. Pura. */
function admite(p: { cuenta: string; grupo?: string }, ctx: ContextoServidaVoz): { ok: boolean; motivo: string } {
  if (!p.cuenta) return { ok: false, motivo: "Petición sin cuenta: nada que atender." };
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.grupo && p.grupo === ctx.sesionGrupo) return { ok: true, motivo: `sesión de grupo «${p.grupo}» compartida aquí` };
  return { ok: false, motivo: "Solo se atienden peticiones de la misma cuenta o de un grupo con permiso." };
}

/** Motores del catálogo que clonan desde una referencia de audio (contrato §3.2). */
const CLONAN = new Set(["cosyvoice3", "voxcpm", "qwen3-tts", "chatterbox", "voicemorphic", "voicestudio"]);

/** Licencia por contexto: «personal» solo a mano en lo propio; «condicionada» si su condición se cumple. */
function entraPorLicencia(m: MotorVozCatalogo, uso: UsoVoz, preferido?: string, condiciones: string[] = []): boolean {
  if (m.claseLicencia === "libre") return true;
  if (m.claseLicencia === "condicionada") return condiciones.includes(m.id);
  return uso === "personal" && !!preferido && m.id === preferido;
}

/** `voz.hablar` por la malla: admite, exige permiso al tercero y elige motor por licencia. Pura. */
export function vozHablarPorMalla(p: PeticionVozMallaCuerpo, ctx: ContextoServidaVoz): PlanVozMalla {
  const uso: UsoVoz = p.uso ?? "personal";
  const puerta = admite(p, ctx);
  if (!puerta.ok) return { ok: false, motivo: puerta.motivo };
  const titular = p.vozTitular ?? p.cuenta;
  const clonar = titular !== p.cuenta;
  if (clonar) {
    const r = puedeClonar({ solicitante: p.cuenta, titular, uso, permisos: ctx.permisos, ahora: ctx.ahora });
    if (!r.ok) return { ok: false, motivo: `Audio de un tercero sin permiso: ${r.motivo}` };
    if (uso !== "personal" && ctx.marcaAguaDisponible !== true) {
      return { ok: false, motivo: "Sin marca de agua (AudioSeal) la voz clonada no sale de lo personal." };
    }
  }
  const ram = Number.isFinite(ctx.ramGB) ? ctx.ramGB : 0;
  const sirve = (m: MotorVozCatalogo) =>
    entraPorLicencia(m, uso, p.motorPreferido, ctx.condicionesCumplidas ?? []) &&
    m.offline && m.plataformas.includes(ctx.plataforma) && m.ramMinGB <= ram && (!clonar || CLONAN.has(m.id));
  const preferido = MOTORES_VOZ.find((m) => m.id === p.motorPreferido);
  // El defecto pasa SIEMPRE por el filtro de licencia: nada «personal» por defecto (como en doblaje).
  const porDefecto = motorRecomendado(ctx.plataforma, ram, uso === "personal" ? "grupo" : uso);
  const elegido = (preferido && sirve(preferido) ? preferido : null) ?? (sirve(porDefecto) ? porDefecto : MOTORES_VOZ.find(sirve) ?? null);
  if (!elegido) return { ok: false, motivo: `Ningún motor de voz permitido en «${uso}» en esta neurona (licencia, medio o RAM).` };
  return {
    ok: true,
    motor: elegido.id,
    motivo: `${elegido.nombre} (${elegido.claseLicencia}) en «${uso}»; voz ${clonar ? "clonada con permiso del titular" : "del propio solicitante"}`,
  };
}

/** `oido.transcribir` por la malla: misma admisión, permiso si el audio es de otra cuenta y oído licenciado. Pura. */
export function oidoTranscribirPorMalla(p: PeticionVozMallaCuerpo, ctx: ContextoServidaVoz): PlanVozMalla {
  const uso: UsoVoz = p.uso ?? "personal";
  const puerta = admite(p, ctx);
  if (!puerta.ok) return { ok: false, motivo: puerta.motivo };
  if (p.vozTitular && p.vozTitular !== p.cuenta) {
    const r = puedeClonar({ solicitante: p.cuenta, titular: p.vozTitular, uso, permisos: ctx.permisos, ahora: ctx.ahora });
    if (!r.ok) return { ok: false, motivo: `Audio de un tercero sin permiso: ${r.motivo}` };
  }
  const licencia = (id: MotorOidoId) => MOTORES_OIDO.find((m) => m.id === id)?.licencia ?? "";
  // El audio ya está aquí: el oído «malla» nunca re-reelisa; fuera de lo personal, solo oído con licencia conocida.
  const disponibles = ctx.oidoDisponibles.filter((id) => id !== "malla" && (uso === "personal" || licencia(id) !== ""));
  if (!disponibles.length) return { ok: false, motivo: `Ningún oído permitido en «${uso}» en esta neurona (solo sale de lo personal con licencia conocida).` };
  const r = elegirOido({ idioma: p.idioma ?? "", disponibles, fase: ctx.fase ?? "final" });
  if (!disponibles.includes(r.motor as MotorOidoId)) return { ok: false, motivo: "El elector de oído no encontró motor disponible en esta neurona." };
  return { ok: true, motor: r.motor, motivo: `${r.motivo} · el audio no sale de las neuronas de su dueño` };
}
