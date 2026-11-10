/**
 * puerta/capas — capas compartibles además de internet: servidores propios, red local y routers (PTA1108C · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. Puro: sin red ni DOM (las fuentes se inyectan).
 *
 *  · DETECTAR: qué capas puede alcanzar ESTA neurona (servidores propios configurados, vecinos y subredes de la LAN,
 *    routers declarados) y anunciarlas con calidad en el anuncio de la puerta.
 *  · DECIDIR (matriz de política): solicitante (misma cuenta / otra) × capa (servidor propio / LAN / router) × ajustes.
 *  · EVALUAR UN DESTINO: lo único privado que una puerta toca es una capa anunciada Y concedida por la política, con
 *    sus puertos declarados; todo lo demás sigue siendo «destino-interno». Devuelve la CONCESIÓN que el lado de Node
 *    (`puerta.cjs`) vuelve a comprobar contra la dirección ya resuelta (DNS rebinding).
 *  · SELECCIONAR: `capaDeDestino` dice si un host necesita una capa (privado) y cuál anunció cada puerta.
 * Solo IPv4 en las capas privadas (una dirección IPv6 privada nunca se concede).
 */

import type { AjustesPuerta } from "@/lib/malla/puerta/politica";
import { hostPermitidoParaOtras, veredictoPuerto } from "@/lib/malla/puerta/politica"; // PTA1110A: veredictoPuerto
import { hostInterno } from "@/lib/malla/puerta-internet";

export type TipoCapa = "servidor-propio" | "lan" | "router-publico" | "ia-neurona";
export const TIPOS_CAPA: readonly TipoCapa[] = ["servidor-propio", "lan", "router-publico", "ia-neurona"];

/**
 * PTA1110A · Capa «IA de esta neurona»: los servidores de IA que corren en el bucle local de la neurona-puerta (Astraura
 * local, Ollama, LM Studio). Quien pide NO usa `127.0.0.1` (sería el suyo): usa este nombre, que solo la puerta traduce, y
 * solo a los puertos declarados. Nunca se concede a otra cuenta ni se abre un puerto de bucle local que no esté declarado.
 */
export const HOST_IA_NEURONA = "ia.neurona.local";
/** Puertos de IA locales que se buscan en el bucle local (Astraura 1.58, Ollama, LM Studio). */
export const PUERTOS_IA_LOCAL: readonly number[] = [8000, 11434, 1234];

export interface CapaPuerta {
  /** Estable dentro de la neurona: `srv:host:puerto`, `lan`, `rtr:host`. */
  id: string;
  tipo: TipoCapa;
  etiqueta: string;
  /** Nombres o IPs literales que la capa alcanza (minúsculas). */
  hosts: string[];
  /** Rangos IPv4 `a.b.c.d/n` que la capa alcanza. */
  cidrs: string[];
  /** Puertos declarados además de los generales (443). */
  puertos: number[];
  /** Calidad medida (milisegundos hasta la capa); null si no se midió. */
  latenciaMs?: number | null;
}

/** Lo que el lado de Node puede abrir: se calcula de las capas PROPIAS y la política, nunca de lo que diga el solicitante. */
export interface Concesion {
  hosts: string[];
  cidrs: string[];
  puertos: number[];
  /** Sumar las subredes de las interfaces locales (Node las conoce) a los rangos concedidos. */
  subredes: boolean;
}

/* ───────────────────────── IPv4 ───────────────────────── */

export function ipv4ANumero(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255) || m.slice(1).some((x) => x.length > 1 && x.startsWith("0"))) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

export function leerCidr(s: string): { base: number; bits: number } | null {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(s);
  if (!m) return null;
  const base = ipv4ANumero(m[1]);
  const bits = Number(m[2]);
  if (base === null || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, bits };
}

export function ipEnCidr(ip: string, cidr: string): boolean {
  const n = ipv4ANumero(ip);
  const c = leerCidr(cidr);
  if (n === null || !c) return false;
  const mask = c.bits === 0 ? 0 : (0xffffffff << (32 - c.bits)) >>> 0;
  return ((n & mask) >>> 0) === c.base;
}

/** Rangos que una capa puede declarar: privados, loopback (servicios en la misma máquina) y CGNAT; nunca públicos ni multicast ni enlace local. */
const RANGOS_CAPA = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "127.0.0.0/8"];

export function cidrDeCapaValido(cidr: string): boolean {
  const c = leerCidr(cidr);
  if (!c) return false;
  // Debe caer ENTERO dentro de un rango permitido (un /8 de 10.x vale; un 0.0.0.0/0 o 8.8.8.0/24 no).
  return RANGOS_CAPA.some((r) => {
    const rr = leerCidr(r);
    return !!rr && c.bits >= rr.bits && ipEnCidr(numeroAIp(c.base), r);
  });
}

export function numeroAIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function ipPrivadaOLocal(ip: string): boolean {
  return RANGOS_CAPA.some((r) => ipEnCidr(ip, r));
}

/* ───────────────────────── Detección ───────────────────────── */

export interface FuentesCapas {
  /** URLs de servidores propios configurados (Supabase/API autoalojados, entradas del registro de servidores). */
  servidoresPropios: Array<{ url: string; etiqueta?: string; latenciaMs?: number | null }>;
  /** IPs de vecinos de la LAN que la neurona ya conoce (descubrimiento nativo, mDNS, faros). */
  vecinosLan: string[];
  /** Subredes de las interfaces locales, `a.b.c.d/n`. */
  subredes: string[];
  /** Routers declarados (host o IP). */
  routers: Array<{ host: string; etiqueta?: string; puertos?: number[]; latenciaMs?: number | null }>;
  /** PTA1110A · Puertos de IA que escuchan AHORA en el bucle local de esta neurona (los mide Node, de una lista fija). */
  iaLocal?: number[];
}

export const FUENTES_VACIAS: FuentesCapas = { servidoresPropios: [], vecinosLan: [], subredes: [], routers: [] };

const LIMITE_CAPAS = 8;
const hostNorm = (h: string): string => h.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");

/** ¿Es un host que NO está en internet público (IP privada/loopback, `.local`/`.lan`/`.home`/`.internal` o nombre de una sola etiqueta)? */
export function hostEsPrivado(host: string): boolean {
  const h = hostNorm(host);
  if (!h) return false;
  if (ipv4ANumero(h) !== null) return ipPrivadaOLocal(h);
  if (h.includes(":")) return false; // IPv6: nunca es una capa
  return h === "localhost" || h.endsWith(".localhost") || /\.(local|lan|home|internal|localdomain|home\.arpa)$/.test(h) || !h.includes(".");
}

function puertoDeUrl(u: URL): number {
  if (u.port) return Number(u.port);
  return u.protocol === "https:" ? 443 : u.protocol === "http:" ? 80 : 0;
}

/** Detecta las capas que esta neurona puede ofrecer. Nunca lanza. */
export function detectarCapas(f: FuentesCapas): CapaPuerta[] {
  const out: CapaPuerta[] = [];
  const porId = new Map<string, CapaPuerta>();
  const meter = (c: CapaPuerta): void => {
    const previa = porId.get(c.id);
    if (previa) {
      previa.puertos = [...new Set([...previa.puertos, ...c.puertos])].slice(0, 8);
      return;
    }
    porId.set(c.id, c);
    out.push(c);
  };
  // 1 · Servidores propios: solo los que no están en internet público (los públicos ya salen por la capa «internet»).
  for (const s of f.servidoresPropios ?? []) {
    try {
      const u = new URL(s.url);
      const host = hostNorm(u.hostname);
      const puerto = puertoDeUrl(u);
      if (!host || !puerto || !hostEsPrivado(host)) continue;
      const esIp = ipv4ANumero(host) !== null;
      meter({
        id: `srv:${host}:${puerto}`,
        tipo: "servidor-propio",
        etiqueta: (s.etiqueta ?? host).slice(0, 60),
        hosts: [host],
        cidrs: esIp ? [`${host}/32`] : [],
        puertos: [puerto],
        latenciaMs: s.latenciaMs ?? null,
      });
    } catch {
      /* URL rota: no es una capa */
    }
  }
  // 2 · Routers declarados.
  for (const r of f.routers ?? []) {
    const host = hostNorm(String(r.host ?? ""));
    if (!host || !hostEsPrivado(host)) continue;
    const esIp = ipv4ANumero(host) !== null;
    const puertos = (r.puertos ?? [443]).filter((p) => Number.isInteger(p) && p > 0 && p < 65536).slice(0, 4);
    meter({ id: `rtr:${host}`, tipo: "router-publico", etiqueta: (r.etiqueta ?? `Router ${host}`).slice(0, 60), hosts: [host], cidrs: esIp ? [`${host}/32`] : [], puertos: puertos.length ? puertos : [443], latenciaMs: r.latenciaMs ?? null });
  }
  // 2b · PTA1110A · IA de esta neurona: solo los puertos de la lista fija que de verdad escuchan.
  const ia = [...new Set((f.iaLocal ?? []).filter((p) => PUERTOS_IA_LOCAL.includes(p)))].slice(0, 4);
  if (ia.length) {
    meter({ id: "ia", tipo: "ia-neurona", etiqueta: "IA de esta neurona", hosts: [HOST_IA_NEURONA], cidrs: [], puertos: ia, latenciaMs: null });
  }
  // 3 · La LAN: subredes de las interfaces; sin ellas, la /24 de cada vecino conocido.
  const cidrs = new Set<string>();
  for (const s of f.subredes ?? []) if (cidrDeCapaValido(s) && !s.startsWith("127.")) cidrs.add(s);
  if (!cidrs.size) {
    for (const ip of f.vecinosLan ?? []) {
      const n = ipv4ANumero(ip);
      if (n !== null && ipPrivadaOLocal(ip) && !ip.startsWith("127.")) cidrs.add(`${numeroAIp((n & 0xffffff00) >>> 0)}/24`);
    }
  }
  if (cidrs.size) {
    meter({ id: "lan", tipo: "lan", etiqueta: "Red local", hosts: [], cidrs: [...cidrs].slice(0, 4), puertos: [], latenciaMs: null });
  }
  return out.slice(0, LIMITE_CAPAS);
}

/** Valida una capa recibida en un anuncio de otra neurona (solo sirve para ELEGIR puerta, nunca para conceder). */
export function leerCapa(x: unknown): CapaPuerta | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id || o.id.length > 120) return null;
  if (!TIPOS_CAPA.includes(o.tipo as TipoCapa)) return null;
  const lista = (v: unknown, max: number, ok: (s: string) => boolean): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.length <= 255 && ok(s)).slice(0, max) : [];
  const hosts = lista(o.hosts, 16, (s) => hostEsPrivado(s)).map(hostNorm);
  const cidrs = lista(o.cidrs, 8, cidrDeCapaValido);
  const puertos = Array.isArray(o.puertos) ? o.puertos.filter((n): n is number => Number.isInteger(n) && n > 0 && n < 65536).slice(0, 8) : [];
  if (!hosts.length && !cidrs.length) return null;
  const lat = typeof o.latenciaMs === "number" && Number.isFinite(o.latenciaMs) && o.latenciaMs >= 0 ? o.latenciaMs : null;
  return { id: o.id, tipo: o.tipo as TipoCapa, etiqueta: typeof o.etiqueta === "string" ? o.etiqueta.slice(0, 60) : o.id, hosts, cidrs, puertos, latenciaMs: lat };
}

/* ───────────────────────── Selección ───────────────────────── */

/** ¿La capa alcanza ese destino? (host nombrado o IP dentro de sus rangos; puerto general o declarado). */
export function capaAlcanza(c: CapaPuerta, host: string, puerto: number): boolean {
  const h = hostNorm(host);
  // PTA1110A: la IA de la neurona solo alcanza SUS puertos declarados (443 no es de ella).
  if (!(c.tipo === "ia-neurona" ? c.puertos.includes(puerto) : puerto === 443 || c.puertos.includes(puerto))) return false;
  if (c.hosts.includes(h)) return true;
  return ipv4ANumero(h) !== null && c.cidrs.some((r) => ipEnCidr(h, r));
}

export function capaDeDestino(capas: readonly CapaPuerta[], host: string, puerto: number): CapaPuerta | null {
  return capas.find((c) => capaAlcanza(c, host, puerto)) ?? null;
}

/** ¿Este destino solo se alcanza con una capa (no está en internet público)? */
export const destinoNecesitaCapa = (host: string): boolean => hostEsPrivado(host);

/* ───────────────────────── Política (matriz) ───────────────────────── */

export interface SolicitanteCapa {
  id: string;
  mismaCuenta: boolean;
}

export type MotivoCapa = "ok" | "capa-apagada" | "lan-no-compartida" | "otra-cuenta-sin-permiso" | "revocada";

export interface DecisionCapa {
  ok: boolean;
  motivo: MotivoCapa;
}

/**
 * Matriz (ajustes por defecto entre paréntesis):
 *   · servidor propio / router — misma cuenta: `compartirServidoresPropios` (ENCENDIDO). Otra cuenta: nunca, salvo permiso explícito por neurona.
 *   · LAN — misma cuenta: `compartirRedLocal` («Compartir mi red local con mis neuronas», APAGADO). Otra cuenta: nunca, salvo
 *     permiso explícito por neurona Y con el interruptor de la LAN encendido.
 */
export function decidirCapa(aj: AjustesPuerta, capa: Pick<CapaPuerta, "tipo">, s: SolicitanteCapa): DecisionCapa {
  if (aj.revocadas.includes(s.id)) return { ok: false, motivo: "revocada" };
  const explicito = (aj.capasPorNeurona[s.id] ?? []).includes(capa.tipo);
  // PTA1110A · IA de esta neurona: SOLO la misma cuenta, nunca por permiso explícito de otra.
  if (capa.tipo === "ia-neurona") {
    if (!s.mismaCuenta) return { ok: false, motivo: "otra-cuenta-sin-permiso" };
    return aj.compartirIaNeurona ? { ok: true, motivo: "ok" } : { ok: false, motivo: "capa-apagada" };
  }
  if (capa.tipo === "lan") {
    if (!aj.compartirRedLocal) return { ok: false, motivo: s.mismaCuenta ? "lan-no-compartida" : "otra-cuenta-sin-permiso" };
    if (s.mismaCuenta || explicito) return { ok: true, motivo: "ok" };
    return { ok: false, motivo: "otra-cuenta-sin-permiso" };
  }
  if (s.mismaCuenta) return aj.compartirServidoresPropios ? { ok: true, motivo: "ok" } : { ok: false, motivo: "capa-apagada" };
  return explicito ? { ok: true, motivo: "ok" } : { ok: false, motivo: "otra-cuenta-sin-permiso" };
}

/** ¿Qué capas ofrece esta neurona a ese solicitante? (para el anuncio por tipo de vecino y para la interfaz) */
export function capasConcedidas(aj: AjustesPuerta, capas: readonly CapaPuerta[], s: SolicitanteCapa): CapaPuerta[] {
  return capas.filter((c) => decidirCapa(aj, c, s).ok);
}

/** Capas que se ANUNCIAN: las que el dueño comparte con alguien (mis neuronas o un permiso explícito). LAN apagada = no se anuncia ni su subred. */
export function capasAnunciables(aj: AjustesPuerta, capas: readonly CapaPuerta[]): CapaPuerta[] {
  const conPermisoAjeno = (t: TipoCapa): boolean => Object.values(aj.capasPorNeurona).some((l) => l.includes(t));
  return capas.filter((c) => (c.tipo === "ia-neurona" ? aj.compartirIaNeurona : c.tipo === "lan" ? aj.compartirRedLocal : aj.compartirServidoresPropios || conPermisoAjeno(c.tipo)));
}

/* ───────────────────────── Evaluar un destino ───────────────────────── */

export type MotivoDestino = "destino-no-valido" | "puerto-no-permitido" | "destino-interno" | "host-no-permitido" | "capa-no-concedida";

export type EvaluacionDestino =
  | {
      ok: true;
      capa: CapaPuerta | null;
      concedido: Concesion | null;
      /** PTA1110A · Host que realmente se abre si no es el pedido (la IA de la neurona: `127.0.0.1`). */
      destino?: string;
      /** PTA1110A · Puerto público fuera de la web corriente: la política es «Preguntar» y hay que preguntar al dueño. */
      preguntarPuerto?: boolean;
    }
  | { ok: false; motivo: MotivoDestino };

/**
 * Qué se le permite a `s` abrir en `host:port` en esta neurona.
 *   · Destino público: solo `aj.puertos` (443); una cuenta ajena además respeta `hostsParaOtras`. Sin concesión: Node
 *     rechazará cualquier dirección privada que el nombre llegue a resolver.
 *   · Destino de una capa PROPIA y concedida: puertos generales + los de la capa. Con concesión exacta para Node.
 *   · Cualquier otro destino privado: «destino-interno». Exactamente las capas anunciadas y concedidas, nada más.
 */
export function evaluarDestino(host: unknown, port: unknown, aj: AjustesPuerta, s: SolicitanteCapa, capasPropias: readonly CapaPuerta[]): EvaluacionDestino {
  if (typeof host !== "string" || !host || host.length > 253 || /[\s/@\\?#]/.test(host)) return { ok: false, motivo: "destino-no-valido" };
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, motivo: "destino-no-valido" };
  const h = hostNorm(host);
  const capa = capaDeDestino(capasPropias, h, port);
  if (capa) {
    if (!decidirCapa(aj, capa, s).ok) return { ok: false, motivo: "capa-no-concedida" };
    if (capa.tipo === "ia-neurona") {
      // La única concesión de bucle local que existe: 127.0.0.1 y ESE puerto declarado. Node la vuelve a comprobar al resolver.
      return { ok: true, capa, destino: "127.0.0.1", concedido: { hosts: [], cidrs: ["127.0.0.1/32"], puertos: [port], subredes: false } };
    }
    return {
      ok: true,
      capa,
      concedido: { hosts: ipv4ANumero(h) !== null ? [] : [h], cidrs: ipv4ANumero(h) !== null ? [`${h}/32`] : [...capa.cidrs], puertos: [port], subredes: capa.tipo === "lan" || (capa.cidrs.length === 0 && ipv4ANumero(h) === null) },
    };
  }
  if (hostEsPrivado(h) || hostInterno(h) || destinoNumericoRaro(h)) {
    // Un puerto fuera de la capa también cae aquí: la capa solo alcanza lo declarado.
    return { ok: false, motivo: "destino-interno" };
  }
  const vp = veredictoPuerto(aj, port); // PTA1110A: 80/443/8080/8443 y los extra; el resto por política
  if (vp === "no") return { ok: false, motivo: "puerto-no-permitido" };
  if (!s.mismaCuenta && !hostPermitidoParaOtras(aj, h)) return { ok: false, motivo: "host-no-permitido" };
  return { ok: true, capa: null, concedido: null, ...(vp === "preguntar" ? { preguntarPuerto: true } : {}) };
}

/** Formas numéricas raras (`2130706433`, `0x7f.1`, `017700000001`): nunca son un nombre público. */
function destinoNumericoRaro(h: string): boolean {
  if (!/^(0x[0-9a-f]*|[0-9]+)(\.(0x[0-9a-f]*|[0-9]+))*$/.test(h)) return false;
  return ipv4ANumero(h) === null || h.split(".").some((o) => o.length > 1 && o.startsWith("0"));
}
