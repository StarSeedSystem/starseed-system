/**
 * red-local-nativa — el canal local de la app nativa como ENLACE del transporte universal (2026-11-07 · MLT1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Contrato: `architecture/datos-por-la-malla.md` §6 y
 * `architecture/sincronizacion-neuronas.md` §2.
 *
 * Entre dos apps nativas de la misma red, SIN internet, el canal TCP 47071 (`malla_local.rs`) ya
 * llevaba la sincronización. Aquí está lo que lo convierte en un enlace más (`nativo:<ip>`):
 *
 *   · LIGADURA: una IP solo cuenta como «la neurona X» tras un `nl.hola` FIRMADO con la identidad de
 *     malla cuya huella es LA MISMA que guardó el vínculo de MSH1107A (ese vínculo es el
 *     consentimiento). Sin vínculo no hay enlace: ni mensajes, ni archivos, ni señales de llamada.
 *   · TRAMAS: varios textos pequeños viajan juntos en un `nl.lote` (dos trozos de archivo de 16 KiB
 *     en base64 caben en una trama de 64 KiB); uno solo viaja tal cual (compatible con apps anteriores).
 *   · RITMO: una cubeta de fichas por IP que nunca pasa del 60 % de lo que el limitador del otro
 *     admite (sus límites llegan en su `nl.hola`; sin ellos, los de la app anterior: 30 cada 10 s).
 *   · ENLACES: `EnlaceDisponible` de tipo `nativo` (rango 0) por cada ligadura viva.
 *   · CUENTA (MLL1107A): dos neuronas de LA MISMA cuenta se ligan también sin «Sincronizar ahora» si el
 *     saludo lleva la prueba de cuenta (`cta`, HMAC con la clave de faro de la cuenta atado a la huella
 *     que firma). Se saluda también a las neuronas de la cuenta que el faro reconoce por su id.
 *
 * La SEÑALIZACIÓN WebRTC (oferta/respuesta por este canal, sin código QR) está en `senal-nativa.ts`.
 */

import type { EnlaceDisponible } from "./eleccion-enlace";

export const PREFIJO_ENLACE_NATIVO = "nativo:";
/** Las sesiones WebRTC señalizadas por el canal nativo: su enlace local es `local:nativo-…`. */
export const PREFIJO_SESION_NATIVA = "nativo-";
export const ETIQUETA_RED_LOCAL_NATIVA = "Red local (app nativa)";
export const PUERTO_CANAL_NATIVO = 47071;

export function idEnlaceNativo(ip: string): string {
  return `${PREFIJO_ENLACE_NATIVO}${ip}`;
}

const RE_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** IPv4 de la red local (privada o de enlace local), o null. Espejo de `ip_local` (Rust). */
export function ipLocal(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const m = RE_IPV4.exec(texto.trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  const [a, b] = o;
  const privada = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  const enlaceLocal = a === 169 && b === 254;
  return privada || enlaceLocal ? o.join(".") : null;
}

export function ipDeEnlaceNativo(id: string | null | undefined): string | null {
  if (!id || !id.startsWith(PREFIJO_ENLACE_NATIVO)) return null;
  return ipLocal(id.slice(PREFIJO_ENLACE_NATIVO.length));
}

/** ¿Este enlace va por la red local de la app nativa? (el canal TCP o el WebRTC que señalizó). */
export function esEnlaceRedLocalNativa(id: string | null | undefined): boolean {
  return !!id && (id.startsWith(PREFIJO_ENLACE_NATIVO) || id.startsWith(`local:${PREFIJO_SESION_NATIVA}`));
}

/* ══════════════════════════ Límites del canal ══════════════════════════ */

export interface LimitesCanal {
  /** Tope del cuerpo de una trama (bytes). */
  maxCuerpo: number;
  /** Mensajes que el limitador del que escucha admite por ventana y por IP. */
  porVentana: number;
  ventanaMs: number;
}

/** Lo que admite una app anterior a MLT1107A (su `malla_local_estado` no dice límites). */
export const LIMITES_CANAL_ANTERIOR: LimitesCanal = { maxCuerpo: 64 * 1024, porVentana: 30, ventanaMs: 10_000 };
/** Parte del cupo del otro que usa esta cola (el resto queda para la sincronización y las ráfagas). */
export const FRACCION_RITMO = 0.6;
/** Bytes que se dejan libres en cada trama (cabeceras y redondeos). */
export const MARGEN_TRAMA = 512;

function entero(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : null;
}

/**
 * Límites anunciados (por `malla_local_estado` o en un `nl.hola`: `{ max_cuerpo, limite_mensajes,
 * limite_ventana_ms }`). Lo que falte o no tenga sentido → los de la app anterior. Nunca por encima
 * de 1 MiB por trama ni de 1000 mensajes por ventana: un anuncio no puede pedir que se le inunde.
 */
export function leerLimites(x: unknown): LimitesCanal {
  if (!x || typeof x !== "object") return { ...LIMITES_CANAL_ANTERIOR };
  const o = x as Record<string, unknown>;
  const maxCuerpo = entero(o.max_cuerpo);
  const porVentana = entero(o.limite_mensajes);
  const ventanaMs = entero(o.limite_ventana_ms);
  if (!maxCuerpo || !porVentana || !ventanaMs) return { ...LIMITES_CANAL_ANTERIOR };
  return {
    maxCuerpo: Math.min(Math.max(maxCuerpo, 4 * 1024), 1024 * 1024),
    porVentana: Math.min(porVentana, 1000),
    ventanaMs: Math.min(Math.max(ventanaMs, 1000), 60_000),
  };
}

/** Para anunciar los límites propios en un `nl.hola` (la forma que lee `leerLimites`). */
export function anuncioLimites(l: LimitesCanal): { max_cuerpo: number; limite_mensajes: number; limite_ventana_ms: number } {
  return { max_cuerpo: l.maxCuerpo, limite_mensajes: l.porVentana, limite_ventana_ms: l.ventanaMs };
}

/** Bytes de texto que caben en una trama hacia ese aparato. */
export function maxTextoPorTrama(l: LimitesCanal): number {
  return Math.max(1024, l.maxCuerpo - MARGEN_TRAMA);
}

/* ══════════════════════════ Ritmo (cubeta de fichas) ══════════════════════════ */

export interface Cubeta {
  fichas: number;
  cap: number;
  /** Fichas por milisegundo. */
  porMs: number;
  at: number;
}

/**
 * Cubeta hacia un aparato: ritmo = 60 % de su cupo y ráfaga = 30 %. En cualquier ventana del
 * limitador del otro se mandan como mucho ráfaga + ritmo = 90 % de su cupo: nunca nos corta.
 */
export function nuevaCubeta(l: LimitesCanal, ahora: number): Cubeta {
  const ritmo = Math.max(1, Math.floor(l.porVentana * FRACCION_RITMO));
  const cap = Math.max(1, Math.floor(l.porVentana * 0.3));
  return { fichas: cap, cap, porMs: ritmo / l.ventanaMs, at: ahora };
}

/** Toma una ficha. `esperaMs` > 0: aún no hay; vuelve a pedirla pasado ese tiempo. */
export function tomarFicha(c: Cubeta, ahora: number): { cubeta: Cubeta; esperaMs: number } {
  const dt = Math.max(0, ahora - c.at);
  const fichas = Math.min(c.cap, c.fichas + dt * c.porMs);
  if (fichas >= 1) return { cubeta: { ...c, fichas: fichas - 1, at: ahora }, esperaMs: 0 };
  return { cubeta: { ...c, fichas, at: ahora }, esperaMs: Math.max(1, Math.ceil((1 - fichas) / c.porMs)) };
}

/** Espera tras un envío fallido (el limitador cortó, la app estaba ocupada…): 0,5 s · 2ⁿ, ≤ 8 s. */
export function esperaTrasFallo(fallos: number): number {
  return Math.min(8000, 500 * 2 ** Math.max(0, fallos - 1));
}

/** Fallos seguidos con los que un aparato se da por caído un rato (y se dice). */
export const FALLOS_PARA_CAIDA = 6;
export const CAIDA_MS = 30_000;

/* ══════════════════════════ Tramas: lotes ══════════════════════════ */

export interface LoteNativo {
  t: "nl.lote";
  m: string[];
}

export const MAX_POR_LOTE = 32;

let codificador: TextEncoder | null = null;

export function bytesUtf8(s: string): number {
  try {
    codificador ??= new TextEncoder();
    return codificador.encode(s).length;
  } catch {
    let n = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0) ?? 0;
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    return n;
  }
}

const CABEZA_LOTE = bytesUtf8('{"t":"nl.lote","m":[');
const COLA_LOTE = bytesUtf8("]}");

function pareceObjeto(t: string): boolean {
  const s = t.trim();
  return s.startsWith("{") && s.endsWith("}");
}

/**
 * armarTrama — cuántos textos de la cabeza de la cola caben en UNA trama de `maxBytes` y su cuerpo.
 * Un texto solo viaja tal cual; varios, en un `nl.lote`. Un texto que no cabe solo, o que no es un
 * objeto JSON, se rechaza (`usados: 1`, `cuerpo: null`, con motivo) para no atascar la cola. Puro.
 */
export function armarTrama(cola: readonly string[], maxBytes: number): { cuerpo: string | null; usados: number; motivo?: string } {
  if (!cola.length) return { cuerpo: null, usados: 0 };
  const primero = cola[0];
  if (typeof primero !== "string" || !pareceObjeto(primero)) {
    return { cuerpo: null, usados: 1, motivo: "el canal local solo lleva objetos JSON" };
  }
  const solo = bytesUtf8(primero);
  if (solo > maxBytes) return { cuerpo: null, usados: 1, motivo: `no cabe en una trama del canal local (${solo} B > ${maxBytes} B)` };
  let total = CABEZA_LOTE + COLA_LOTE;
  const dentro: string[] = [];
  for (const t of cola.slice(0, MAX_POR_LOTE)) {
    if (typeof t !== "string" || !pareceObjeto(t)) break;
    const extra = bytesUtf8(JSON.stringify(t)) + (dentro.length ? 1 : 0);
    if (total + extra > maxBytes) break;
    total += extra;
    dentro.push(t);
  }
  if (dentro.length <= 1) return { cuerpo: primero, usados: 1 };
  return { cuerpo: JSON.stringify({ t: "nl.lote", m: dentro } satisfies LoteNativo), usados: dentro.length };
}

/** Los textos de un `nl.lote` (o null si no lo es). Solo objetos JSON; nunca más de `MAX_POR_LOTE`. */
export function desempaquetarLote(cuerpo: string): string[] | null {
  if (typeof cuerpo !== "string" || !cuerpo.startsWith('{"t":"nl.lote"')) return null;
  let o: unknown;
  try {
    o = JSON.parse(cuerpo);
  } catch {
    return null;
  }
  const m = (o as { m?: unknown } | null)?.m;
  if (!Array.isArray(m)) return null;
  return m
    .slice(0, MAX_POR_LOTE)
    .filter((t): t is string => typeof t === "string" && pareceObjeto(t) && !t.startsWith('{"t":"nl.lote"'));
}

/** Clase de cola de un texto: `datos` (archivos, en orden estricto) o `control` (lo demás, primero). */
export function claseDeTexto(t: string): "control" | "datos" {
  return t.startsWith('{"t":"archivo.') ? "datos" : "control";
}

/* ══════════════════════════ Saludo firmado y ligaduras ══════════════════════════ */

/** Lo mínimo de un vínculo de MSH1107A (`VinculoNeurona`). */
export interface VinculoMinimo {
  neurona: string;
  sync?: string;
  cuenta?: string;
  nombre: string;
  huella?: string;
  ultimaIp?: string;
}

/** Lo mínimo de un vecino oído por el faro (`VecinoRedLocal`). */
export interface VecinoMinimo {
  ip: string;
  neurona: string | null;
  puerto: number;
  canal: boolean | null;
}

export interface QuienNativo {
  neurona: string;
  sync?: string;
  cuenta?: string;
  nombre: string;
}

export interface HolaNativa {
  t: "nl.hola";
  v: 1;
  de: QuienNativo;
  /** Neurona a la que saluda (las demás lo ignoran). */
  para: string;
  /** Límites del canal de QUIEN saluda (lo que su app admite recibir). */
  lim?: { max_cuerpo: number; limite_mensajes: number; limite_ventana_ms: number };
  /** Su webview tiene WebRTC: se puede abrir el enlace directo para llamadas, pantalla y flujos. */
  webrtc: boolean;
  /** Es la contestación a otro saludo (no se contesta, para no rebotar). */
  resp?: boolean;
  ts: number;
  /**
   * (MLL1107A) Prueba de cuenta: `pruebaCuenta` del texto `textoPruebaCuenta` (32 hex). Solo la puede
   * calcular quien tiene la clave de faro de la cuenta. Va DENTRO del sobre firmado.
   */
  cta?: string;
}

/* ══════════════════════════ Prueba de cuenta (MLL1107A) ══════════════════════════ */

/** Largo de la prueba de cuenta en hex (16 bytes del HMAC-SHA256). */
export const LARGO_PRUEBA_CUENTA = 32;

export function esPruebaCuenta(x: unknown): x is string {
  return typeof x === "string" && x.length === LARGO_PRUEBA_CUENTA && /^[0-9a-f]+$/.test(x);
}

/**
 * Texto que se firma con la clave de faro de la cuenta. Ata la prueba a la HUELLA que firma el sobre,
 * a las dos neuronas y al instante del saludo: copiar `cta` a un saludo firmado por otra identidad no
 * vale, y el sobre ya trae su guarda contra repeticiones (instante + nonce). Puro.
 */
export function textoPruebaCuenta(p: { huella: string; de: string; para: string; ts: number }): string {
  return `ss-nl-cuenta-v1|${p.huella}|${p.de}|${p.para}|${p.ts}`;
}

/** Comparación de dos pruebas sin cortar al primer carácter distinto. Puro. */
export function mismaPrueba(a: string | undefined, b: string | null | undefined): boolean {
  if (!esPruebaCuenta(a) || !esPruebaCuenta(b)) return false;
  let d = 0;
  for (let i = 0; i < LARGO_PRUEBA_CUENTA; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function texto(x: unknown, max: number): string | undefined {
  return typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined;
}

export function leerQuien(x: unknown): QuienNativo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const neurona = texto(o.neurona, 80);
  if (!neurona) return null;
  const q: QuienNativo = { neurona, nombre: texto(o.nombre, 60) ?? "Neurona" };
  const sync = texto(o.sync, 80);
  const cuenta = texto(o.cuenta, 80);
  if (sync) q.sync = sync;
  if (cuenta) q.cuenta = cuenta;
  return q;
}

export function holaNativa(p: { de: QuienNativo; para: string; limites: LimitesCanal | null; webrtc: boolean; resp?: boolean; ts: number; cta?: string | null }): HolaNativa {
  return {
    t: "nl.hola",
    v: 1,
    de: p.de,
    para: p.para,
    ...(p.limites ? { lim: anuncioLimites(p.limites) } : {}),
    webrtc: p.webrtc,
    ...(p.resp ? { resp: true } : {}),
    ts: p.ts,
    ...(esPruebaCuenta(p.cta) ? { cta: p.cta } : {}),
  };
}

export function leerHola(x: unknown): HolaNativa | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.t !== "nl.hola" || o.v !== 1) return null;
  const de = leerQuien(o.de);
  const para = texto(o.para, 80);
  if (!de || !para || typeof o.ts !== "number") return null;
  const lim = o.lim && typeof o.lim === "object" ? anuncioLimites(leerLimites(o.lim)) : undefined;
  return {
    t: "nl.hola",
    v: 1,
    de,
    para,
    ...(lim ? { lim } : {}),
    webrtc: o.webrtc === true,
    ...(o.resp === true ? { resp: true } : {}),
    ts: o.ts,
    ...(esPruebaCuenta(o.cta) ? { cta: o.cta } : {}),
  };
}

/**
 * ¿Se acepta este saludo? Solo si es para esta neurona y, además:
 *  · viene de una neurona VINCULADA y la firma es de LA MISMA identidad que guardó el vínculo (primer
 *    uso en la solicitud de MSH1107A), o
 *  · (MLL1107A) trae la prueba de cuenta válida (`cuentaProbada`: quien saluda tiene la clave de faro de
 *    TU cuenta, atada a la huella que firma). Tus propias neuronas no necesitan «Sincronizar ahora»: la
 *    cuenta es el consentimiento. Con la prueba vale aunque el vínculo guardara otra huella (la misma
 *    cuenta reinstaló su identidad de malla).
 * Puro.
 */
export function aceptarHola(
  h: HolaNativa,
  huella: string | undefined,
  yo: string,
  vinculos: readonly VinculoMinimo[],
  opciones: { cuentaProbada?: boolean } = {},
): { ok: true; vinculo: VinculoMinimo; porCuenta: boolean } | { ok: false; motivo: string } {
  if (h.para !== yo) return { ok: false, motivo: "el saludo es para otra neurona" };
  if (h.de.neurona === yo) return { ok: false, motivo: "eco de esta misma neurona" };
  const v = vinculos.find((x) => x.neurona === h.de.neurona);
  if (v && v.huella && huella && v.huella === huella) return { ok: true, vinculo: v, porCuenta: false };
  if (opciones.cuentaProbada && huella) {
    const base: VinculoMinimo = v ?? {
      neurona: h.de.neurona,
      nombre: h.de.nombre,
      ...(h.de.sync ? { sync: h.de.sync } : {}),
      ...(h.de.cuenta ? { cuenta: h.de.cuenta } : {}),
    };
    return { ok: true, vinculo: { ...base, huella }, porCuenta: true };
  }
  if (!v) return { ok: false, motivo: "no hay vínculo con esa neurona (primero «Sincronizar ahora») ni prueba de tu cuenta" };
  if (!v.huella || !huella) return { ok: false, motivo: "el vínculo no guarda la huella de esa neurona" };
  return { ok: false, motivo: "la firma no es la de la neurona vinculada" };
}

/** Una IP que ya dijo, firmando, quién es. */
export interface Ligadura {
  ip: string;
  puerto: number;
  neurona: string;
  huella: string;
  nombre: string;
  sync?: string;
  cuenta?: string;
  limites: LimitesCanal;
  webrtc: boolean;
  /** Último saludo verificado (epoch ms). */
  at: number;
  /** (MLL1107A) Ligada por la prueba de cuenta (sin vínculo con esa huella). */
  porCuenta?: boolean;
}

/** Una ligadura vale esto sin un saludo nuevo (cada lado saluda cada `CADA_HOLA_MS`). */
export const VIDA_LIGADURA_MS = 5 * 60_000;
export const CADA_HOLA_MS = 2 * 60_000;
/** Entre dos saludos a la misma IP (aunque no conteste), como poco. */
export const ENTRE_HOLAS_MS = 30_000;

/** Pone una ligadura: una IP es de UNA neurona y una neurona está en UNA IP (gana la última). */
export function ligar(lista: readonly Ligadura[], l: Ligadura): Ligadura[] {
  return [l, ...lista.filter((x) => x.ip !== l.ip && x.neurona !== l.neurona)];
}

export function vigente(l: Ligadura, ahora: number): boolean {
  return ahora - l.at <= VIDA_LIGADURA_MS;
}

export function ligaduraDeIp(lista: readonly Ligadura[], ip: string, ahora: number): Ligadura | null {
  return lista.find((l) => l.ip === ip && vigente(l, ahora)) ?? null;
}

export function ligaduraDeNeurona(lista: readonly Ligadura[], neurona: string, ahora: number): Ligadura | null {
  return lista.find((l) => l.neurona === neurona && vigente(l, ahora)) ?? null;
}

export function podarLigaduras(lista: readonly Ligadura[], ahora: number): Ligadura[] {
  return lista.filter((l) => vigente(l, ahora));
}

/**
 * IPs de la red local donde puede estar esa neurona ahora: las de los faros que la reconocen por su id
 * (solo los de TU cuenta llevan id: lo comprueba el HMAC de la clave de faro) o la última IP de su
 * vínculo (si esa IP no es de otra neurona). Sin las que dicen no tener canal. Puro.
 */
export function ipsDeNeurona(neurona: string, vecinos: readonly VecinoMinimo[], vinculo?: VinculoMinimo): Array<{ ip: string; puerto: number }> {
  const out: Array<{ ip: string; puerto: number }> = [];
  for (const x of vecinos) {
    if (x.canal === false) continue;
    const porId = x.neurona === neurona;
    const porIp = !!vinculo?.ultimaIp && x.ip === vinculo.ultimaIp && (!x.neurona || x.neurona === neurona);
    if (!porId && !porIp) continue;
    const ip = ipLocal(x.ip);
    if (!ip || out.some((o) => o.ip === ip)) continue;
    out.push({ ip, puerto: x.puerto >= 1024 ? x.puerto : PUERTO_CANAL_NATIVO });
  }
  return out;
}

/**
 * destinosHola — a qué IPs saludar ahora: las de las neuronas VINCULADAS que el faro oye (por su id
 * o por la última IP del vínculo, si esa IP no es de otra neurona) y, con `cuenta` (esta app tiene la
 * clave de faro: su saludo lleva la prueba de cuenta, MLL1107A), también las neuronas de TU cuenta que
 * el faro reconoce por su id aunque no haya vínculo. Sin ligadura reciente y sin un saludo en los
 * últimos `ENTRE_HOLAS_MS`. Puro.
 */
export function destinosHola(p: {
  vecinos: readonly VecinoMinimo[];
  vinculos: readonly VinculoMinimo[];
  ligaduras: readonly Ligadura[];
  ultimoHola: Readonly<Record<string, number>>;
  ahora: number;
  cuenta?: boolean;
}): Array<{ ip: string; puerto: number; neurona: string }> {
  const out: Array<{ ip: string; puerto: number; neurona: string }> = [];
  const vistas = new Set<string>();
  const poner = (neurona: string) => {
    const lig = ligaduraDeNeurona(p.ligaduras, neurona, p.ahora);
    if (lig && p.ahora - lig.at < CADA_HOLA_MS) return;
    for (const c of ipsDeNeurona(neurona, p.vecinos, p.vinculos.find((v) => v.neurona === neurona))) {
      if (vistas.has(c.ip)) continue;
      if (p.ahora - (p.ultimoHola[c.ip] ?? -Infinity) < ENTRE_HOLAS_MS) continue;
      vistas.add(c.ip);
      out.push({ ip: c.ip, puerto: c.puerto, neurona });
    }
  };
  for (const v of p.vinculos) poner(v.neurona);
  if (p.cuenta) {
    const vinculadas = new Set(p.vinculos.map((v) => v.neurona));
    for (const x of p.vecinos) if (x.neurona && !vinculadas.has(x.neurona)) poner(x.neurona);
  }
  return out;
}

/* ══════════════════════════ Diagnóstico hacia una neurona (MLL1107A) ══════════════════════════ */

/** Cuánto espera un envío a que se ligue una neurona que el faro oye (una vez por saludo). */
export const ESPERA_LIGADURA_MS = 1_500;

export type EstadoHaciaNeurona =
  | { estado: "ligada"; ip: string; motivo: string }
  | { estado: "sin-canal" | "no-se-oye" | "sin-confianza" | "sin-respuesta" | "caida"; ip?: string; motivo: string };

/**
 * Por qué hay (o no) enlace `nativo:<ip>` con esa neurona ahora mismo, en una frase para la vía del
 * mensaje («Red local (app nativa): …»). No mide nada: lee lo que el motor ya sabe. Puro.
 */
export function diagnosticoHacia(p: {
  neurona: string;
  escuchando: boolean;
  vecinos: readonly VecinoMinimo[];
  vinculos: readonly VinculoMinimo[];
  ligaduras: readonly Ligadura[];
  caidas: Readonly<Record<string, number>>;
  ultimoHola: Readonly<Record<string, number>>;
  ahora: number;
  cuenta: boolean;
}): EstadoHaciaNeurona {
  const lig = ligaduraDeNeurona(p.ligaduras, p.neurona, p.ahora);
  if (lig) {
    if ((p.caidas[lig.ip] ?? 0) > p.ahora) return { estado: "caida", ip: lig.ip, motivo: `su app (${lig.ip}) no acusa recibo ahora; se reintenta en unos segundos` };
    return { estado: "ligada", ip: lig.ip, motivo: `ligada en ${lig.ip}${lig.porCuenta ? " (misma cuenta)" : ""}` };
  }
  if (!p.escuchando) return { estado: "sin-canal", motivo: "el canal local de esta app (TCP 47071) no escucha" };
  const vinculo = p.vinculos.find((v) => v.neurona === p.neurona);
  const ips = ipsDeNeurona(p.neurona, p.vecinos, vinculo);
  if (!ips.length) {
    return { estado: "no-se-oye", motivo: "su faro no se oye en esta red local (otra red, app cerrada, o el punto de acceso no deja pasar el multicast)" };
  }
  const ip = ips[0].ip;
  if (!vinculo && !p.cuenta) {
    return { estado: "sin-confianza", ip, motivo: `se oye en ${ip}, pero sin vínculo ni clave de faro de la cuenta en esta app no hay saludo (primero «Sincronizar ahora»)` };
  }
  const hace = p.ahora - (p.ultimoHola[ip] ?? -Infinity);
  return {
    estado: "sin-respuesta",
    ip,
    motivo:
      hace < ENTRE_HOLAS_MS
        ? `se oye en ${ip}, pero su app no contestó al saludo firmado (app 0.5.0 o anterior, sin vínculo ni clave de tu cuenta, o firma distinta)`
        : `se oye en ${ip}; aún sin saludo`,
  };
}

/* ══════════════════════════ Enlaces para el transporte universal ══════════════════════════ */

/**
 * enlacesNativos — un `EnlaceDisponible` de tipo `nativo` por ligadura vigente. Abierto si el canal
 * de este aparato escucha y ese aparato no está caído (fallos seguidos). La latencia es la ida y
 * vuelta MEDIDA del último envío (conectar + trama + acuse); sin envío, «sin medir». Puro.
 */
export function enlacesNativos(p: {
  ligaduras: readonly Ligadura[];
  ahora: number;
  escuchando: boolean;
  caidas: Readonly<Record<string, number>>;
  rtt: Readonly<Record<string, number>>;
}): EnlaceDisponible[] {
  return p.ligaduras
    .filter((l) => vigente(l, p.ahora))
    .map((l) => ({
      id: idEnlaceNativo(l.ip),
      tipo: "nativo" as const,
      etiqueta: `${l.nombre} · red local`,
      alcanza: { neuronDeviceId: l.neurona, ...(l.sync ? { syncDeviceId: l.sync } : {}), ...(l.cuenta ? { uid: l.cuenta } : {}) },
      abierto: p.escuchando && !((p.caidas[l.ip] ?? 0) > p.ahora),
      sinInternet: true,
      ruta: "misma-red-local" as const,
      rttMs: typeof p.rtt[l.ip] === "number" ? p.rtt[l.ip] : null,
      capacidadKbps: null,
      admite: { mensaje: true, archivo: true, flujo: false },
      consentido: true,
    }));
}

/* ══════════════════════════ SDP: candidatos con la IP real ══════════════════════════ */

/**
 * candidatosConIp — el navegador esconde su IP local tras un nombre mDNS (`…​.local`) en los candidatos
 * `host`. Si el punto de acceso bloquea mDNS, el otro no lo resuelve y la conexión no se abre. Por el
 * canal nativo sabemos la IP REAL del otro (la conexión TCP vino de ella y es de la red local): se
 * AÑADE, tras cada candidato mDNS, una copia con esa IP (el original se queda: si el aparato tiene
 * varias interfaces, ICE prueba las dos). Puro.
 */
export function candidatosConIp(sdp: string, ip: string): string {
  const ipOk = ipLocal(ip);
  if (!ipOk || typeof sdp !== "string") return sdp;
  const fin = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lineas = sdp.split(/\r?\n/);
  const out: string[] = [];
  for (const l of lineas) {
    out.push(l);
    if (!l.startsWith("a=candidate:")) continue;
    const partes = l.split(" ");
    // a=candidate:<fundación> <componente> <transporte> <prioridad> <dirección> <puerto> typ <tipo> …
    if (partes.length < 8 || partes[6] !== "typ" || partes[7] !== "host") continue;
    if (!partes[4].toLowerCase().endsWith(".local")) continue;
    const copia = [...partes];
    copia[4] = ipOk;
    out.push(copia.join(" "));
  }
  return out.join(fin);
}
