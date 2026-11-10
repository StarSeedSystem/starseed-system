/**
 * puerta/tunel — túnel de bytes tipo CONNECT por la malla (PTA1108A · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3.
 *
 * Una neurona sin internet abre un túnel `host:443` por la mejor «puerta» (otra neurona con salida), con saltos
 * intermedios si la puerta no es vecina. La puerta abre un socket TCP y copia bytes en ambos sentidos: el TLS va de
 * PUNTA A PUNTA (quien pide ↔ el sitio), así que ni la puerta ni los relés leen el contenido.
 *
 * Sin DOM ni red propios: el transporte (tramas JSON entre vecinas), el socket TCP, las preguntas al dueño y el reloj
 * se inyectan. Cada enlace del túnel (`Lado`) lleva su propia numeración, reordenación, ventana y acuses: la
 * contrapresión es de punta a punta (un relé no acusa hasta haber reenviado).
 */

import { aB64, deB64 } from "@/lib/malla/cifrado-archivo";
import { hostInterno } from "@/lib/malla/puerta-internet";
import {
  PUERTOS_PUBLICA, // PTA1110B
  ambitoDePuerta, // PTA1110B
  ambitoEfectivo, // PTA1110B
  topesDeAmbito, // PTA1110B
  type Ambito, // PTA1110B
  carrilPermitido, // PTA1110A
  decidirServir,
  hostPermitidoParaOtras,
  veredictoPuerto, // PTA1110A
  type AjustesPuerta,
  type EleccionGrande, // PTA1110A
  type TipoUso, // PTA1110A
  type EstadoPropio,
  type Solicitante,
} from "@/lib/malla/puerta/politica";
import { destinoNecesitaCapa, evaluarDestino, type CapaPuerta, type Concesion } from "@/lib/malla/puerta/capas"; // PTA1108C
import { BIN_ACUSE, BIN_DATOS, codificarBin, decodificarBin } from "@/lib/malla/puerta/binario"; // PTA1110A
import { BYTES_DESCARGA_GRANDE, clasificarTrafico } from "@/lib/malla/puerta/actividad"; // PTA1110A
import { MAX_SALTOS, REANUNCIO_MS, TablaPuertas, leerAnuncio, reanunciar, type AnuncioPuerta, type EstimacionEnlace } from "@/lib/malla/puerta/tabla";

/* ───────────────────────── Tramas ───────────────────────── */

export type Trama =
  | { k: "anuncio"; a: AnuncioPuerta }
  | { k: "abrir"; s: string; host: string; port: number; ttl: number; via: string[]; de: string; mc: boolean; f?: string[] /* PTA1110A: capacidades que ofrece quien abre ("bin") */; am?: Ambito /* PTA1110B: ámbito declarado de quien pide (cada salto lo recorta a lo que sabe de su vecina) */; g?: string /* PTA1110B: grupo declarado */ }
  | { k: "retira"; id: string } /* PTA1110B: la puerta `id` ya no tiene salida (cambio de rol): se borra de las tablas y se cierra lo que iba por ella */
  | { k: "esp"; s: string }
  | { k: "ok"; s: string; f?: string[] /* PTA1110A: las que acepta quien contesta */ }
  | { k: "err"; s: string; m: string }
  | { k: "dat"; s: string; n: number; b: string }
  | { k: "ack"; s: string; n: number }
  | { k: "fin"; s: string; m?: string };

export interface MetaVecino extends EstimacionEnlace {
  /** El vecino demostró ser de mi cuenta (certificado o huella guardada). */
  mismaCuenta: boolean;
}

export interface TransportePuerta {
  yo(): string;
  /** Entrega una trama a un vecino; true = confirmada (acuse del otro lado). */
  enviar(vecino: string, t: Trama): Promise<boolean>;
  alRecibir(cb: (vecino: string, t: Trama, meta: MetaVecino) => void): () => void;
  /** Vecinos con enlace abierto ahora. */
  vecinos(): string[];
  /** Bytes que se pueden mandar por trama a ese vecino (Bluetooth: pocos). */
  tamTrozo?(vecino: string): number;
  /**
   * PTA1110A · Camino BINARIO (solo si el transporte lleva bytes crudos: el canal rápido L2CAP, TCP). Hoy el transporte
   * universal solo lleva texto JSON; sin esto los túneles usan el JSON de siempre. true = entregado.
   */
  enviarBin?(vecino: string, b: Uint8Array): Promise<boolean>;
  alRecibirBin?(cb: (vecino: string, b: Uint8Array) => void): () => void;
  /** PTA1110A · Capacidad medida del enlace hacia ese vecino en kb/s (carril lento = trozos y ventana pequeños). */
  anchoKbps?(vecino: string): number | null;
}

export interface SocketSalida {
  escribir(b: Uint8Array): Promise<void>;
  /** El callback puede devolver una promesa: mientras no se resuelve, no se lee más del socket. */
  alDatos(cb: (b: Uint8Array) => Promise<void> | void): void;
  alCerrar(cb: (error?: string) => void): void;
  cerrar(): void;
}

export interface AuditoriaPuerta {
  t: number;
  /** Neurona que pidió (según su trama) y vecina por la que llegó. */
  de: string;
  vecino: string;
  /** Solo host y puerto: NUNCA ruta ni contenido. */
  host: string;
  puerto: number;
  bytes: number;
  grupo: "mias" | "otras" | "publica" | "grupo";
  /** PTA1110B · id del grupo o comunidad cuando `grupo` es «grupo». */
  grupoId?: string;
  resultado: string;
  ms: number;
}

export type Pregunta = "permitir" | "denegar" | "siempre" | "nunca";

export interface DepsGestor {
  transporte: TransportePuerta;
  tabla: TablaPuertas;
  ajustes: () => AjustesPuerta;
  /** Guarda cambios de ajustes (recordar respuestas, revocar). */
  cambiarAjustes?: (cambio: (a: AjustesPuerta) => AjustesPuerta) => void;
  estado: () => EstadoPropio;
  /** Anuncio de la salida propia, o null si no hay (se repite cada `REANUNCIO_MS`). */
  anuncioPropio: () => AnuncioPuerta | null;
  /** Abre un TCP de salida. Sin esto esta neurona no puede ser puerta (solo relé). */
  abrirTcp?: (host: string, port: number, o: { permitirPrivadas: boolean; concedido?: Concesion | null }) => Promise<SocketSalida>; // PTA1108C: `concedido` = lo único privado que Node puede abrir
  /** PTA1108C · Capas que esta neurona ofrece ahora (servidores propios, LAN, routers). Sin esto no se sirve nada privado. */
  capasPropias?: () => CapaPuerta[];
  preguntar?: (s: Solicitante, host: string, motivo?: "otra-cuenta" | "datos-moviles" | "puerto") => Promise<Pregunta>; // PTA1110B: motivo
  ahora?: () => number;
  nuevoId?: () => string;
  esperar?: (ms: number) => Promise<void>;
  plazoAperturaMs?: number;
  plazoPreguntaMs?: number;
  plazoAckMs?: number;
  inactividadMs?: number;
  /** Ventana FIJA en tramas: modo antiguo (PTA1108A) sin capacidad medida, sin binario y sin acuses agrupados. Sin esto, todo es adaptativo (PTA1110A). */
  ventana?: number;
  /** PTA1110A · Hosts propios del OS (su Supabase) para reconocer «datos de StarSeed». */
  hostsStarSeed?: () => string[];
  /** PTA1110B · Cuenta de esta neurona (para reconocer puertas «mías» que llegan reenviadas). */
  miCuenta?: () => string | null;
  /** PTA1110B · Uso de una puerta de ámbito «Preguntar» (grupo): ¿el usuario ya dijo que sí? Sin esto se exige respuesta. */
  usoConfirmado?: (puerta: string, ambito: Ambito, grupo?: string) => boolean;
  /** PTA1110A · Una descarga grande va por un carril lento: pregunta (una vez) qué hacer. Sin esto se continúa. */
  alGrande?: (i: InfoGrande) => Promise<{ eleccion: Exclude<EleccionGrande, "preguntar">; recordar: boolean }>;
}

/** PTA1110A · Por debajo de esto un carril es «lento» para avisar de descargas grandes. */
export const UMBRAL_LENTO_KBPS = 800;
/** PTA1110A · Cuánto se espera un carril más rápido antes de cancelar la descarga en espera. */
export const ESPERA_CARRIL_RAPIDO_MS = 15 * 60_000;

export interface InfoGrande {
  id: string;
  host: string;
  puerto: number;
  tipo: TipoUso;
  bytes: number;
  kbps: number;
  /** Segundos que llevaría 1 MiB más a ese ritmo (orientativo). */
  segundosPorMiB: number;
}

export interface ActividadSesion {
  id: string;
  rol: "cliente" | "puerta" | "rele";
  tipo: TipoUso;
  host: string;
  puerto: number;
  bytes: number;
  bytesPorSegundo: number;
  enlace: string;
  vecino: string;
  de: string;
  desde: number;
  pausada: boolean;
  esperandoCarril: boolean;
}

export interface CarrilVista {
  vecino: string;
  kbps: number;
  bytesEnVuelo: number;
  ventana: number;
  rttMs: number | null;
  tunelesActivos: number;
}

export interface TunelCliente {
  /** PTA1110A */
  id: string;
  tipo: TipoUso;
  puerta: string;
  vecino: string;
  enlace: string;
  saltos: number;
  escribir(b: Uint8Array): Promise<boolean>;
  alDatos(cb: (b: Uint8Array) => Promise<void> | void): void;
  alCerrar(cb: (motivo: string) => void): void;
  cerrar(): void;
}

export interface ResumenCompartiendo {
  id: string;
  de: string;
  vecino: string;
  host: string;
  grupo: "mias" | "otras" | "publica" | "grupo";
  /** PTA1110B */
  grupoId?: string;
  rol: "puerta" | "rele";
  bytes: number;
  desde: number;
}

export interface GestorPuerta {
  abrirTunel(host: string, port: number, o?: { evitarMedida?: boolean; excluir?: string[]; tipo?: TipoUso }): Promise<TunelCliente | { error: string }>;
  /** PTA1110A · Lo que pasa ahora por esta neurona (propios y ajenos), sin contenido: tipo, host, bytes, velocidad, carril. */
  actividad(): ActividadSesion[];
  /** PTA1110A · Capacidad medida de cada carril con tráfico. */
  carriles(): CarrilVista[];
  pausar(id: string): void;
  reanudar(id: string): void;
  cancelar(id: string): void;
  /** Cierra y veta a una neurona. */
  revocar(id: string): void;
  /** Cierra todo lo que se comparte (botón «Parar»). */
  detenerCompartir(): void;
  compartiendo(): ResumenCompartiendo[];
  auditoria(): AuditoriaPuerta[];
  bytesHoy(grupo: "mias" | "otras"): number;
  /** PTA1110B · Bytes servidos hoy a un ámbito: «mias», «otras», «publica» o «g:<id>»; y por datos móviles. */
  bytesHoyDe(clave: string): number;
  bytesHoyMovil(): number;
  /** PTA1110B · Esta neurona perdió su salida: corta lo que servía hacia fuera y avisa a las vecinas (cambio de rol). */
  salidaPerdida(): void;
  anunciar(): void;
  barrer(): void;
  iniciar(): void;
  detener(): void;
  /** Túneles propios abiertos. `vecino` = primer salto (la neurona a la que se le habla directamente). */
  tunelesPropios(): { puerta: string; enlace: string; saltos: number; vecino: string }[];
}

/* ───────────────────────── Constantes ───────────────────────── */

const VENTANA = 8;
const TROZO = 8 * 1024;
/** PTA1110A · Trozo inicial (sin medida) y tope de ventana por carril; trozos en vuelo por túnel; espera máxima antes de ceder turno. */
const TROZO_INICIAL = 2048;
const VENTANA_MAX_BYTES = 192 * 1024;
const MAX_TROZOS_TUNEL = 32;
const ESPERA_MAX_REPARTO_MS = 800;
const RETARDO_ACK_MS = 25;
const ACK_CADA = 2;
const REINTENTOS_TRAMA = 3;
const PLAZO_APERTURA_MS = 8_000;
const PLAZO_PREGUNTA_MS = 30_000;
const PLAZO_ACK_MS = 20_000;
const INACTIVIDAD_MS = 120_000;
const MAX_AUDITORIA = 100;
const MAX_SESIONES = 64;
const MAX_INTENTOS_PUERTAS = 3;

/** Dirección que no debe tocarse desde una puerta, incluidas formas numéricas raras (`2130706433`, `0x7f.1`). */
export function destinoInterno(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (hostInterno(h)) return true;
  // Formas numéricas (decimal entero, octal, hex, abreviadas): solo se admite el IPv4 «a.b.c.d» normal, sin ceros a la izquierda.
  if (/^(0x[0-9a-f]*|[0-9]+)(\.(0x[0-9a-f]*|[0-9]+))*$/.test(h)) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
    return h.split(".").some((o) => o.length > 1 && o.startsWith("0"));
  }
  return false;
}

/** Valida host y puerto de una apertura. Devuelve el motivo si no vale. */
export function validarDestino(host: unknown, port: unknown, aj: AjustesPuerta, mismaCuenta: boolean): string | null {
  if (typeof host !== "string" || !host || host.length > 253 || /[\s/@\\?#]/.test(host)) return "destino-no-valido";
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return "destino-no-valido";
  if (veredictoPuerto(aj, port) === "no") return "puerto-no-permitido"; // PTA1110A: web corriente y política de otros puertos
  // PTA1108C: lo privado ya no se abre con un interruptor general; solo por una capa concedida (`evaluarDestino`).
  if (destinoInterno(host)) return "destino-interno";
  if (!mismaCuenta && !hostPermitidoParaOtras(aj, host)) return "host-no-permitido";
  return null;
}

/* ───────────────────────── Gestor ───────────────────────── */

interface Lado {
  vecino: string;
  sid: string;
  tx: number;
  acked: number;
  rx: number;
  reorden: Map<number, Uint8Array>;
  esperando: Array<() => void>;
  drenando: boolean;
  cola: Promise<boolean>;
  /** PTA1110A · trozos en vuelo (n → instante y bytes), bytes servidos en total (reparto justo), último envío, binario negociado, acuses agrupados. */
  enVuelo: Map<number, { t: number; b: number }>;
  servido: number;
  ultimoEnvio: number;
  ofrecioBin: boolean;
  bin: boolean;
  sinAck: number;
  timerAck: ReturnType<typeof setTimeout> | null;
}

/** PTA1110A · Cola de envío de UN vecino: los túneles que comparten un carril se reparten su capacidad medida. */
interface Pend {
  l: Lado;
  s: Sesion;
  datos: Uint8Array;
  off: number;
  res: (ok: boolean) => void;
  desde: number;
}
interface Emisor {
  vecino: string;
  pend: Pend[];
  bombeando: boolean;
  bytesVuelo: number;
  wnd: number;
  minRtt: number;
  srtt: number;
  muestras: Array<{ t: number; b: number }>;
  huecos: Array<() => void>;
}

type Rol = "cliente" | "puerta" | "rele";

interface Sesion {
  id: string;
  rol: Rol;
  /** Hacia quien pidió (puerta/relé). */
  a: Lado | null;
  /** Hacia la puerta (cliente/relé). */
  b: Lado | null;
  cerrada: boolean;
  abierta: boolean;
  de: string;
  host: string;
  puerto: number;
  bytes: number;
  /** Cubo de cuota: «mias», «otras», «publica» o «g:<id>» (PTA1110B). */
  grupo: string;
  /** PTA1110B */
  ambito: Ambito;
  grupoId?: string;
  /** PTA1110B · salida a internet (no a una capa privada): se corta si esta neurona pierde su salida. */
  haciaInternet?: boolean;
  desde: number;
  ultimo: number;
  socket?: SocketSalida;
  /** PTA1110A */
  tipo: TipoUso;
  enlace: string;
  vel: number;
  acum: number;
  tVel: number;
  pausada: boolean;
  esperaCarril: boolean;
  pausadaDesde: number;
  reanudar?: () => void;
  grandeVisto: boolean;
  /** Resuelve la espera de apertura del lado `b`. */
  alApertura?: (r: { ok: true } | { ok: false; m: string } | { esp: true }) => void;
  datos?: (b: Uint8Array) => Promise<void> | void;
  backlog: Uint8Array[];
  alCerrar?: (m: string) => void;
  info?: { puerta: string; enlace: string; saltos: number };
}

const clave = (vecino: string, sid: string): string => `${vecino}\u0000${sid}`;

export function crearGestorPuerta(deps: DepsGestor): GestorPuerta {
  const T = deps.transporte;
  const yo = T.yo();
  const ahora = deps.ahora ?? (() => Date.now());
  const nuevoId = deps.nuevoId ?? (() => globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16));
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const plazoApertura = deps.plazoAperturaMs ?? PLAZO_APERTURA_MS;
  const plazoPregunta = deps.plazoPreguntaMs ?? PLAZO_PREGUNTA_MS;
  const plazoAck = deps.plazoAckMs ?? PLAZO_ACK_MS;
  const inactividad = deps.inactividadMs ?? INACTIVIDAD_MS;
  const ventana = deps.ventana ?? VENTANA;
  const adaptativo = deps.ventana === undefined; // PTA1110A
  const maxAdelanto = adaptativo ? 4 * MAX_TROZOS_TUNEL : 4 * ventana;
  const emisores = new Map<string, Emisor>();

  const sesiones = new Map<string, Sesion>();
  const porLado = new Map<string, { s: Sesion; l: Lado }>();
  const ring: AuditoriaPuerta[] = [];
  const uso = { dia: "", mias: 0, otras: 0, publica: 0, movil: 0, grupos: {} as Record<string, number> };
  const metas = new Map<string, MetaVecino>(); // PTA1110B: lo último que se sabe de cada vecina
  let baja: (() => void) | null = null;
  let bajaBin: (() => void) | null = null; // PTA1110A
  let reloj: ReturnType<typeof setInterval> | null = null;

  const diaDe = (t: number): string => new Date(t).toISOString().slice(0, 10);
  const rotar = (): void => {
    const d = diaDe(ahora());
    if (d !== uso.dia) {
      uso.dia = d;
      uso.mias = 0;
      uso.otras = 0;
      uso.publica = 0;
      uso.movil = 0;
      uso.grupos = {};
    }
  };
  const usoDe = (g: string): number => (g === "mias" ? uso.mias : g === "publica" ? uso.publica : g.startsWith("g:") ? uso.grupos[g] ?? 0 : uso.otras);
  const contar = (g: string, n: number, servidoPorPuerta = false): void => {
    rotar();
    if (g === "mias") uso.mias += n;
    else if (g === "publica") uso.publica += n;
    else if (g.startsWith("g:")) uso.grupos[g] = (uso.grupos[g] ?? 0) + n;
    else uso.otras += n;
    if (servidoPorPuerta && deps.estado().medida) uso.movil += n; // PTA1110B: lo que sale por datos móviles
  };
  const claveCubo = (a: Ambito, g?: string): string => (a === "grupo" && g ? `g:${g}` : a === "grupo" ? "otras" : a);
  const usable = (e: { vecino: string; anuncio: AnuncioPuerta }, aj: AjustesPuerta): boolean => {
    const r = ambitoDePuerta(aj, e, { miCuenta: deps.miCuenta?.() ?? null, vecinoMismaCuenta: (id) => metas.get(id)?.mismaCuenta === true });
    if (!r.permitido) return false;
    // «Preguntar» en grupos: hasta que el usuario conteste que sí no se usa. (Para «mias» lo gobierna el servicio con `modoUso`.)
    if (r.ambito === "grupo" && r.preguntar) return deps.usoConfirmado?.(e.anuncio.id, r.ambito, r.grupo) === true;
    return true;
  };
  const tamTrozo = (v: string): number => Math.max(512, Math.min(TROZO, T.tamTrozo?.(v) ?? TROZO));

  /* ── Lados ── */
  function nuevoLado(vecino: string, sid: string): Lado {
    return {
      vecino, sid, tx: 0, acked: -1, rx: 0, reorden: new Map(), esperando: [], drenando: false, cola: Promise.resolve(true),
      enVuelo: new Map(), servido: 0, ultimoEnvio: ahora(), ofrecioBin: false, bin: false, sinAck: 0, timerAck: null,
    };
  }
  function registrar(s: Sesion, l: Lado): void {
    porLado.set(clave(l.vecino, l.sid), { s, l });
  }
  function soltarLado(l: Lado | null): void {
    if (!l) return;
    porLado.delete(clave(l.vecino, l.sid));
    for (const f of l.esperando.splice(0)) f();
    if (l.timerAck) clearTimeout(l.timerAck);
    l.timerAck = null;
    // PTA1110A: lo que quedaba en vuelo de este lado ya no ocupa la ventana del carril; se despierta a la cola de envío.
    const em = emisores.get(l.vecino);
    if (em) {
      for (const f of l.enVuelo.values()) em.bytesVuelo = Math.max(0, em.bytesVuelo - f.b);
      l.enVuelo.clear();
      for (const h of em.huecos.splice(0)) h();
    }
  }

  async function mandarTrama(vecino: string, t: Trama): Promise<boolean> {
    for (let i = 0; i < REINTENTOS_TRAMA; i++) {
      try {
        if (await T.enviar(vecino, t)) return true;
      } catch {
        /* se reintenta */
      }
      if (i < REINTENTOS_TRAMA - 1) await esperar(50 * (i + 1));
    }
    return false;
  }

  /* ── PTA1110A · Emisor por vecino: ventana por capacidad medida, reparto justo entre túneles, trozos binarios ── */
  function emisor(v: string): Emisor {
    let e = emisores.get(v);
    if (!e) {
      e = { vecino: v, pend: [], bombeando: false, bytesVuelo: 0, wnd: 3 * TROZO_INICIAL, minRtt: Infinity, srtt: 0, muestras: [], huecos: [] };
      emisores.set(v, e);
    }
    return e;
  }

  /** Bytes/s entregados al otro lado en los últimos 3 s (o lo que dice el transporte si aún no hay medida). */
  function bpsDe(em: Emisor): number {
    const t = ahora();
    const v = em.muestras.filter((m) => t - m.t <= 3000);
    if (v.length >= 2) {
      const span = Math.max(t - v[0].t, 300);
      return v.reduce((a, m) => a + m.b, 0) / (span / 1000);
    }
    const kb = T.anchoKbps?.(em.vecino);
    return typeof kb === "number" && kb > 0 ? (kb * 1000) / 8 : 0;
  }

  /** Trozo: ≈ 0,4 s del carril (a 300 kb/s ≈ 15 KB, con tope del transporte); sin medida, 2 KiB. */
  function trozoDe(em: Emisor): number {
    const max = tamTrozo(em.vecino);
    if (!adaptativo) return max;
    const bps = bpsDe(em);
    return bps <= 0 ? Math.min(max, TROZO_INICIAL) : Math.max(512, Math.min(max, Math.round(bps * 0.4)));
  }

  function hayHueco(em: Emisor, l: Lado, tam: number): boolean {
    if (!adaptativo) return l.tx - 1 - l.acked < ventana;
    return (em.bytesVuelo === 0 || em.bytesVuelo + tam <= em.wnd) && l.tx - 1 - l.acked < MAX_TROZOS_TUNEL;
  }

  function esperarHueco(em: Emisor): Promise<boolean> {
    return new Promise<boolean>((res) => {
      const t = setTimeout(() => {
        const i = em.huecos.indexOf(despertar);
        if (i >= 0) em.huecos.splice(i, 1);
        res(false);
      }, plazoAck);
      const despertar = (): void => {
        clearTimeout(t);
        res(true);
      };
      em.huecos.push(despertar);
    });
  }

  /** Reparto: el túnel que menos ha enviado va primero (lo interactivo pasa delante de lo masivo); nadie espera más de `ESPERA_MAX_REPARTO_MS`. */
  function elegirPend(em: Emisor): Pend | null {
    const vistos = new Set<Lado>();
    const cand: Pend[] = [];
    for (const p of em.pend) {
      if (vistos.has(p.l)) continue;
      vistos.add(p.l);
      cand.push(p);
    }
    if (!cand.length) return null;
    if (!adaptativo) return cand[0];
    const t = ahora();
    const hambrientos = cand.filter((p) => t - Math.max(p.l.ultimoEnvio, p.desde) > ESPERA_MAX_REPARTO_MS);
    if (hambrientos.length) return hambrientos.reduce((a, b) => (Math.max(a.l.ultimoEnvio, a.desde) <= Math.max(b.l.ultimoEnvio, b.desde) ? a : b));
    return cand.reduce((a, b) => (b.l.servido < a.l.servido ? b : a));
  }

  function medir(s: Sesion, n: number): void {
    const t = ahora();
    s.acum += n;
    const dt = t - s.tVel;
    if (dt >= 400) {
      const inst = s.acum / (dt / 1000);
      s.vel = s.vel === 0 ? inst : s.vel * 0.5 + inst * 0.5;
      s.acum = 0;
      s.tVel = t;
    }
  }

  /** Construye la trama (síncrono: el llamador puede reutilizar el buffer) y la manda sin esperar su entrega. */
  function enviarDat(l: Lado, n: number, parte: Uint8Array): Promise<boolean> {
    if (l.bin && T.enviarBin) {
      const bytes = codificarBin({ tipo: BIN_DATOS, s: l.sid, n, b: parte });
      const prueba = async (): Promise<boolean> => {
        for (let i = 0; i < REINTENTOS_TRAMA; i++) {
          try {
            if (await (T.enviarBin as NonNullable<TransportePuerta["enviarBin"]>)(l.vecino, bytes)) return true;
          } catch {
            /* se reintenta */
          }
          if (i < REINTENTOS_TRAMA - 1) await esperar(50 * (i + 1));
        }
        return false;
      };
      return prueba();
    }
    return mandarTrama(l.vecino, { k: "dat", s: l.sid, n, b: aB64(parte) });
  }

  function enviarAck(l: Lado, n: number): void {
    l.sinAck = 0;
    if (l.timerAck) clearTimeout(l.timerAck);
    l.timerAck = null;
    if (l.bin && T.enviarBin) void T.enviarBin(l.vecino, codificarBin({ tipo: BIN_ACUSE, s: l.sid, n })).catch(() => undefined);
    else void mandarTrama(l.vecino, { k: "ack", s: l.sid, n });
  }

  /** Acuse acumulado: en modo adaptativo se agrupa (cada `ACK_CADA` trozos o a los `RETARDO_ACK_MS`) para no gastar el carril en acuses. */
  function pedirAck(l: Lado, n: number): void {
    if (!adaptativo) return enviarAck(l, n);
    l.sinAck++;
    if (l.sinAck >= ACK_CADA) return enviarAck(l, n);
    if (!l.timerAck) {
      l.timerAck = setTimeout(() => {
        l.timerAck = null;
        enviarAck(l, l.rx - 1);
      }, RETARDO_ACK_MS);
    }
  }

  function lanzarDat(s: Sesion, l: Lado, em: Emisor, parte: Uint8Array): void {
    const n = l.tx++;
    const t = ahora();
    l.enVuelo.set(n, { t, b: parte.length });
    em.bytesVuelo += parte.length;
    l.servido += parte.length;
    l.ultimoEnvio = t;
    s.bytes += parte.length;
    s.ultimo = t;
    medir(s, parte.length);
    if (s.rol !== "cliente") contar(s.grupo, parte.length, s.rol === "puerta");
    void enviarDat(l, n, parte).then((ok) => {
      if (!ok) cerrar(s, "enlace-caido");
    });
  }

  /** Un acuse acumulado hasta `hasta` libera sus trozos, mide el viaje de ida y vuelta y mueve la ventana del carril. */
  function liberar(l: Lado, previo: number, hasta: number): void {
    const em = emisores.get(l.vecino);
    if (!em) return;
    const t = ahora();
    let bytes = 0;
    let rtt: number | null = null;
    for (let n = previo + 1; n <= hasta; n++) {
      const f = l.enVuelo.get(n);
      if (!f) continue;
      bytes += f.b;
      rtt = t - f.t;
      l.enVuelo.delete(n);
    }
    em.bytesVuelo = Math.max(0, em.bytesVuelo - bytes);
    if (bytes > 0) {
      em.muestras.push({ t, b: bytes });
      if (em.muestras.length > 64) em.muestras.shift();
    }
    if (adaptativo && rtt !== null && bytes > 0) {
      if (rtt < em.minRtt) em.minRtt = rtt;
      em.srtt = em.srtt ? 0.8 * em.srtt + 0.2 * rtt : rtt;
      const base = em.minRtt;
      if (rtt <= base * 1.25 + 40) em.wnd = Math.min(VENTANA_MAX_BYTES, em.wnd + bytes); // hay holgura: crece
      else if (rtt > base * 2 + 150) em.wnd = Math.max(2 * trozoDe(em), Math.round(em.wnd * 0.75)); // la cola del carril crece: frena
    }
    for (const h of em.huecos.splice(0)) h();
  }

  async function bombear(em: Emisor): Promise<void> {
    if (em.bombeando) return;
    em.bombeando = true;
    try {
      for (;;) {
        for (const p of em.pend.filter((x) => x.s.cerrada)) {
          em.pend.splice(em.pend.indexOf(p), 1);
          p.res(false);
        }
        const p = elegirPend(em);
        if (!p) return;
        const tam = Math.min(trozoDe(em), p.datos.length - p.off);
        if (!hayHueco(em, p.l, tam)) {
          if (!(await esperarHueco(em))) {
            // Venció el plazo de acuses: se cierran los túneles que tenían trozos sin acusar.
            for (const x of [...em.pend]) if (x.l.enVuelo.size > 0) cerrar(x.s, "sin-acuse");
            if (!em.pend.some((x) => !x.s.cerrada)) return;
            em.bytesVuelo = 0;
          }
          continue;
        }
        const parte = p.datos.subarray(p.off, p.off + tam);
        p.off += tam;
        lanzarDat(p.s, p.l, em, parte);
        if (p.off >= p.datos.length) {
          em.pend.splice(em.pend.indexOf(p), 1);
          p.res(true);
        }
      }
    } finally {
      em.bombeando = false;
    }
  }

  function mandarDatos(l: Lado, s: Sesion, datos: Uint8Array): Promise<boolean> {
    if (s.cerrada) return Promise.resolve(false);
    if (datos.length === 0) return Promise.resolve(true);
    const em = emisor(l.vecino);
    return new Promise<boolean>((res) => {
      em.pend.push({ l, s, datos, off: 0, res, desde: ahora() });
      void bombear(em);
    });
  }

  /** PTA1110A · Antes de dar bytes a una descarga: respeta la pausa y avisa UNA vez si es grande y va por un carril lento. */
  async function vigilarGrande(s: Sesion): Promise<void> {
    while (s.pausada && !s.cerrada) await new Promise<void>((r) => (s.reanudar = r));
    if (s.cerrada) throw new Error("cerrada");
    if (s.tipo === "navegacion" && s.bytes >= BYTES_DESCARGA_GRANDE) {
      s.tipo = "descargas";
      if (deps.ajustes().usos?.descargas === false) {
        cerrar(s, "descargas-apagadas");
        throw new Error("descargas-apagadas");
      }
    }
    if (s.grandeVisto || s.bytes < BYTES_DESCARGA_GRANDE || !(s.tipo === "descargas" || s.tipo === "actualizaciones" || s.tipo === "capas")) return;
    s.grandeVisto = true;
    const em = s.b ? emisores.get(s.b.vecino) : undefined;
    // Una descarga RECIBE: el emisor hacia la puerta solo manda acuses, así que la velocidad real es la que mide la sesión.
    const bps = Math.max(em ? bpsDe(em) : 0, s.vel);
    const kbps = (bps * 8) / 1000;
    if (!(kbps > 0 && kbps < UMBRAL_LENTO_KBPS)) return;
    let eleccion: EleccionGrande = deps.ajustes().grandeLento ?? "preguntar";
    if (eleccion === "preguntar") {
      s.pausada = true;
      s.pausadaDesde = ahora();
      try {
        const r = deps.alGrande
          ? await deps.alGrande({ id: s.id, host: s.host, puerto: s.puerto, tipo: s.tipo, bytes: s.bytes, kbps, segundosPorMiB: bps > 0 ? Math.round(1048576 / bps) : 0 })
          : { eleccion: "continuar" as const, recordar: false };
        eleccion = r.eleccion;
        if (r.recordar) deps.cambiarAjustes?.((a) => ({ ...a, grandeLento: r.eleccion }));
      } catch {
        eleccion = "continuar";
      }
      s.pausada = false;
    }
    if (eleccion === "solo-wifi") {
      cerrar(s, "solo-wifi");
      throw new Error("solo-wifi");
    }
    if (eleccion === "esperar") {
      s.pausada = true;
      s.esperaCarril = true;
      s.pausadaDesde = ahora();
      while (s.pausada && !s.cerrada) await new Promise<void>((r) => (s.reanudar = r));
      if (s.cerrada) throw new Error("cerrada");
    }
  }

  async function entregar(s: Sesion, l: Lado, bytes: Uint8Array): Promise<void> {
    s.ultimo = ahora();
    if (s.rol === "puerta") {
      contar(s.grupo, bytes.length, true);
      s.bytes += bytes.length;
      await s.socket?.escribir(bytes);
      if (cuotaVencida(s)) cerrar(s, "cuota");
    } else if (s.rol === "rele") {
      const otro = l === s.a ? s.b : s.a;
      if (!otro || !(await mandarDatos(otro, s, bytes))) throw new Error("rele");
    } else if (s.datos) {
      if (s.rol === "cliente") {
        s.bytes += bytes.length; // PTA1110A: lo recibido también cuenta en la actividad
        medir(s, bytes.length);
        await vigilarGrande(s);
      }
      await s.datos(bytes);
    } else if (s.backlog.length < 256) s.backlog.push(bytes);
  }

  async function drenar(s: Sesion, l: Lado): Promise<void> {
    if (l.drenando) return;
    l.drenando = true;
    try {
      while (!s.cerrada && l.reorden.has(l.rx)) {
        const b = l.reorden.get(l.rx) as Uint8Array;
        l.reorden.delete(l.rx);
        const n = l.rx++;
        try {
          await entregar(s, l, b);
        } catch {
          cerrar(s, "entrega");
          return;
        }
        pedirAck(l, n); // PTA1110A: acumulado y, en modo adaptativo, agrupado
      }
    } finally {
      l.drenando = false;
    }
    if (!s.cerrada && l.reorden.has(l.rx)) void drenar(s, l);
  }

  function aceptarDat(s: Sesion, l: Lado, n: number, bytes: Uint8Array): void {
    if (n < l.rx) {
      enviarAck(l, l.rx - 1); // duplicado: se vuelve a acusar
      return;
    }
    if (n >= l.rx + maxAdelanto) return; // fuera de ventana
    l.reorden.set(n, bytes);
    void drenar(s, l);
  }

  function recibirDat(s: Sesion, l: Lado, t: Extract<Trama, { k: "dat" }>): void {
    if (typeof t.n !== "number" || !Number.isInteger(t.n) || t.n < 0 || typeof t.b !== "string") return;
    if (t.n < l.rx || t.n >= l.rx + maxAdelanto) return aceptarDat(s, l, t.n, new Uint8Array(0));
    const bytes = deB64(t.b);
    if (!bytes) return;
    aceptarDat(s, l, t.n, bytes);
  }

  function recibirAck(l: Lado, n: number): void {
    if (typeof n !== "number" || n <= l.acked) return;
    const previo = l.acked;
    l.acked = n;
    liberar(l, previo, n);
    for (const f of l.esperando.splice(0)) f();
  }

  /** PTA1110A · Trama binaria (datos o acuse) llegada por el camino binario del transporte. */
  function recibirBin(vecino: string, crudo: Uint8Array): void {
    const f = decodificarBin(crudo);
    if (!f) return;
    const e = porLado.get(clave(vecino, f.s));
    if (!e || e.s.cerrada || !e.l.bin) return;
    if (f.tipo === BIN_ACUSE) recibirAck(e.l, f.n);
    else aceptarDat(e.s, e.l, f.n, f.b.slice());
  }

  /* ── Cierre, cuotas y auditoría ── */
  function cuotaVencida(s: Sesion): boolean {
    if (s.rol === "cliente") return false;
    rotar();
    const a = deps.ajustes();
    // PTA1110B: cuota POR ÁMBITO (mis neuronas, cada grupo, otras cuentas, pública) y tope aparte por datos móviles.
    if (usoDe(s.grupo) >= topesDeAmbito(a, s.ambito, s.grupoId).bytesDia) return true;
    return s.rol === "puerta" && deps.estado().medida && uso.movil >= a.datosMoviles.bytesDia;
  }

  function auditar(s: Sesion, resultado: string): void {
    if (s.rol === "cliente") return;
    ring.push({ t: s.desde, de: s.de, vecino: s.a?.vecino ?? "", host: s.host, puerto: s.puerto, bytes: s.bytes, grupo: s.ambito, ...(s.grupoId ? { grupoId: s.grupoId } : {}), resultado, ms: ahora() - s.desde });
    if (ring.length > MAX_AUDITORIA) ring.shift();
  }

  function cerrar(s: Sesion, motivo: string, desde?: Lado): void {
    if (s.cerrada) return;
    s.cerrada = true;
    sesiones.delete(s.id);
    for (const l of [s.a, s.b]) {
      if (!l) continue;
      if (l !== desde) void T.enviar(l.vecino, { k: "fin", s: l.sid, m: motivo }).catch(() => undefined);
      soltarLado(l);
    }
    try {
      s.socket?.cerrar();
    } catch {
      /* ya cerrado */
    }
    s.alApertura?.({ ok: false, m: motivo });
    s.reanudar?.(); // PTA1110A: una descarga pausada o en espera se suelta al cerrar
    auditar(s, s.abierta ? motivo : `no-abrio:${motivo}`);
    try {
      s.alCerrar?.(motivo);
    } catch {
      /* el oyente no debe tumbar al gestor */
    }
  }

  /* ── Apertura hacia una vecina (cliente y relé) ── */
  function abrirHacia(s: Sesion, vecino: string, t: Omit<Extract<Trama, { k: "abrir" }>, "s">): Promise<{ ok: true } | { ok: false; m: string }> {
    const l = nuevoLado(vecino, nuevoId());
    l.ofrecioBin = Array.isArray(t.f) && t.f.includes("bin"); // PTA1110A
    s.b = l;
    registrar(s, l);
    return new Promise((res) => {
      let hecho = false;
      let temporizador: ReturnType<typeof setTimeout>;
      const fin = (r: { ok: true } | { ok: false; m: string }): void => {
        if (hecho) return;
        hecho = true;
        clearTimeout(temporizador);
        s.alApertura = undefined;
        if (!r.ok) {
          soltarLado(l);
          if (s.b === l) s.b = null;
        }
        res(r);
      };
      const armar = (ms: number): void => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => fin({ ok: false, m: "sin-respuesta" }), ms);
      };
      armar(plazoApertura);
      s.alApertura = (r) => {
        if ("esp" in r) armar(plazoPregunta);
        else fin(r);
      };
      void mandarTrama(vecino, { ...t, s: l.sid }).then((ok) => {
        if (!ok) fin({ ok: false, m: "enlace-caido" });
      });
    });
  }

  /** PTA1110A · Campos de seguimiento de una sesión nueva. */
  function camposNuevos(tipo: TipoUso, enlace: string) {
    return { tipo, enlace, vel: 0, acum: 0, tVel: ahora(), pausada: false, esperaCarril: false, pausadaDesde: 0, grandeVisto: false };
  }

  /* ── Cliente ── */
  /** PTA1110A · Lo que esta neurona ofrece a cada vecino al abrir un túnel. */
  const capacidadesPropias = (): string[] | undefined => (adaptativo && T.enviarBin && T.alRecibirBin ? ["bin"] : undefined);

  async function abrirTunel(host: string, port: number, o: { evitarMedida?: boolean; excluir?: string[]; tipo?: TipoUso } = {}): Promise<TunelCliente | { error: string }> {
    const aj0 = deps.ajustes();
    if (!aj0.usarPuertas || aj0.modoUso === "nunca") return { error: "desactivado" };
    if (sesiones.size >= MAX_SESIONES) return { error: "demasiados-tuneles" };
    // PTA1110A · qué puede salir por la malla (navegación, datos, IA…) y a qué puertos públicos.
    const tipo = o.tipo ?? clasificarTrafico(host, port, { hostsStarSeed: deps.hostsStarSeed?.() });
    if (aj0.usos && aj0.usos[tipo] === false) return { error: "uso-desactivado" };
    if (!destinoNecesitaCapa(host) && !destinoInterno(host) && veredictoPuerto(aj0, port) === "no") return { error: "puerto-no-permitido" };
    const probadas = new Set<string>(o.excluir ?? []);
    let ultimo = "sin-puertas";
    for (let i = 0; i < MAX_INTENTOS_PUERTAS; i++) {
      const e = deps.tabla.elegir({ excluir: probadas, evitarMedida: o.evitarMedida, host, puerto: port, filtro: (x) => carrilPermitido(aj0, x.tipoEnlace, x.enlace) && usable(x, aj0) }); // PTA1108C: la puerta que tenga la capa del destino · PTA1110A: solo por los carriles permitidos · PTA1110B: y por los ámbitos que el usuario dejó usar
      if (!e) break;
      probadas.add(e.anuncio.id);
      const s: Sesion = {
        id: nuevoId(), rol: "cliente", a: null, b: null, cerrada: false, abierta: false, de: yo, host, puerto: port,
        bytes: 0, grupo: "mias", ambito: "mias", desde: ahora(), ultimo: ahora(), backlog: [],
        info: { puerta: e.anuncio.id, enlace: e.enlace, saltos: e.anuncio.saltos },
        ...camposNuevos(tipo, e.enlace),
      };
      sesiones.set(s.id, s);
      const f = capacidadesPropias();
            // PTA1110B: si la puerta es pública para mí, lo digo: la puerta me atiende por su capa pública (o me pregunta), no por una cuenta que no comparte.
      const uso0 = ambitoDePuerta(aj0, e, { miCuenta: deps.miCuenta?.() ?? null, vecinoMismaCuenta: (id) => metas.get(id)?.mismaCuenta === true });
      const r = await abrirHacia(s, e.vecino, { k: "abrir", host, port, ttl: e.anuncio.saltos, via: [yo], de: yo, mc: true, ...(uso0.ambito === "publica" ? { am: "publica" as const } : {}), ...(f ? { f } : {}) });
      if (r.ok) {
        s.abierta = true;
        deps.tabla.marcarAcierto(e.anuncio.id);
        return tunelDe(s);
      }
      sesiones.delete(s.id);
      s.cerrada = true;
      ultimo = r.m;
      // Un rechazo de política no es fallo de enlace, pero igualmente probamos otra puerta.
      deps.tabla.marcarFallo(e.anuncio.id);
    }
    // PTA1108C: un destino privado sin ninguna puerta que ofrezca su capa no es «sin puertas», es «sin capa».
    // (PTA1110A: si había puertas pero ninguna por un carril permitido, el motivo sigue siendo «sin-puertas».)
    return { error: ultimo === "sin-puertas" && destinoInterno(host) ? "sin-capa" : ultimo };
  }

  function tunelDe(s: Sesion): TunelCliente {
    const info = s.info as { puerta: string; enlace: string; saltos: number };
    return {
      id: s.id,
      tipo: s.tipo,
      puerta: info.puerta,
      vecino: (s.b as Lado).vecino,
      enlace: info.enlace,
      saltos: info.saltos,
      escribir: async (b) => (s.cerrada || !s.b ? false : mandarDatos(s.b, s, b)),
      alDatos(cb) {
        s.datos = cb;
        const pend = s.backlog.splice(0);
        void (async () => {
          for (const b of pend) await cb(b);
        })();
      },
      alCerrar(cb) {
        if (s.cerrada) cb("cerrado");
        else s.alCerrar = cb;
      },
      cerrar: () => cerrar(s, "fin"),
    };
  }

  /* ── Puerta y relé ── */
  async function alAbrir(vecino: string, t: Extract<Trama, { k: "abrir" }>, meta: MetaVecino): Promise<void> {
    const responder = (tr: Trama): void => void T.enviar(vecino, tr).catch(() => undefined);
    const err = (m: string): void => responder({ k: "err", s: t.s, m });
    if (
      typeof t.s !== "string" || !t.s || t.s.length > 40 || typeof t.de !== "string" || !t.de || t.de.length > 80 || !Array.isArray(t.via) ||
      t.via.length > MAX_SALTOS + 2 || typeof t.ttl !== "number" || !Number.isInteger(t.ttl) || t.ttl < 0 || t.ttl > MAX_SALTOS
    ) {
      return err("trama-no-valida");
    }
    if (porLado.has(clave(vecino, t.s))) return; // repetida
    if (t.via.includes(yo)) return err("bucle");
    if (sesiones.size >= MAX_SESIONES) return err("ocupada");
    const aj = deps.ajustes();
    // PTA1110B · ÁMBITO de quien pide, decidido con lo que YO sé de mi vecina; lo declarado por la cadena solo puede bajar.
    const directa = vecino === t.de && t.via.length === 1 && t.via[0] === vecino;
    const amb = ambitoEfectivo(aj, { id: vecino, mismaCuenta: meta.mismaCuenta }, { directa, mc: t.mc === true, am: t.am, g: t.g });
    const mc = amb.ambito === "mias";
    const sol: Solicitante = { id: t.de, mismaCuenta: mc, ambito: amb.ambito, ...(amb.grupo ? { grupo: amb.grupo } : {}) };
    const grupo: Sesion["grupo"] = claveCubo(amb.ambito, amb.grupo);
    const s: Sesion = {
      id: nuevoId(), rol: "puerta", a: nuevoLado(vecino, t.s), b: null, cerrada: false, abierta: false, de: t.de, host: String(t.host).slice(0, 253),
      puerto: Number(t.port) || 0, bytes: 0, grupo, ambito: amb.ambito, ...(amb.grupo ? { grupoId: amb.grupo } : {}), desde: ahora(), ultimo: ahora(), backlog: [],
      ...camposNuevos(clasificarTrafico(String(t.host), Number(t.port) || 0, { hostsStarSeed: deps.hostsStarSeed?.() }), meta.etiqueta),
    };
    // PTA1110A: binario solo si quien abre lo ofrece Y este transporte lo lleva (cada tramo del túnel se negocia solo).
    const bin = adaptativo && !!T.enviarBin && !!T.alRecibirBin && Array.isArray(t.f) && t.f.includes("bin");
    (s.a as Lado).bin = bin;
    const okTrama = (): Trama => ({ k: "ok", s: t.s, ...(bin ? { f: ["bin"] } : {}) });
    registrar(s, s.a as Lado);
    sesiones.set(s.id, s);
    const rechazar = (m: string): void => {
      s.rol = "puerta";
      cerrar(s, m, s.a as Lado);
      err(m);
    };
    if (aj.revocadas.includes(t.de) || aj.revocadas.includes(vecino)) return rechazar("revocada");

    // PTA1108C · ¿Qué destino es y qué capa de las MÍAS lo cubre? Lo privado solo con una capa anunciada y concedida.
    const ev = evaluarDestino(t.host, t.port, aj, sol, deps.capasPropias?.() ?? []);
    const aReleSinCapa = !ev.ok && ev.motivo === "destino-interno" && t.ttl > 0; // no tengo esa capa: quizá otra puerta sí
    if (!ev.ok && !aReleSinCapa) return rechazar(ev.motivo);
    // PTA1110B · La capa pública solo sirve la web corriente a destinos públicos: ni capas privadas, ni puertos «Preguntar».
    if (amb.ambito === "publica" && ev.ok && (ev.capa || ev.preguntarPuerto || !PUERTOS_PUBLICA.includes(Number(t.port)))) return rechazar("puerto-no-permitido");
    s.haciaInternet = ev.ok && !ev.capa;

    // 1) ¿Puedo ser la puerta?
    let motivoPuerta = "sin-salida";
    if (deps.abrirTcp && !aReleSinCapa) {
      rotar();
      const gruposSes = [...sesiones.values()].filter((x) => x.rol === "puerta" && x.grupo === grupo && x !== s).length;
      const movilHoy = uso.movil;
      // Una capa privada no gasta internet ni red medida: se sirve aunque esta neurona no tenga salida a internet.
      const estServir = ev.ok && ev.capa ? { ...deps.estado(), conInternet: true, medida: false } : deps.estado();
      const dec = decidirServir(aj, sol, estServir, { bytesHoyGrupo: usoDe(grupo), tunelesGrupo: gruposSes, bytesMovilHoy: movilHoy });
      motivoPuerta = dec.motivo;
      let veredicto = dec.veredicto;
      if (veredicto === "preguntar") {
        responder({ k: "esp", s: t.s });
        let r: Pregunta = "denegar";
        try {
          r = deps.preguntar ? await Promise.race([deps.preguntar(sol, String(t.host), dec.motivo === "datos-moviles" ? "datos-moviles" : "otra-cuenta"), esperar(plazoPregunta).then((): Pregunta => "denegar")]) : "denegar";
        } catch {
          r = "denegar";
        }
        if (r === "siempre" || r === "nunca") {
          // PTA1110B: «¿datos móviles?» se recuerda aparte de «¿otra cuenta?».
          if (dec.motivo === "datos-moviles") deps.cambiarAjustes?.((a) => ({ ...a, movilRecordadas: { ...a.movilRecordadas, [t.de]: r === "siempre" ? "permitir" : "denegar" } }));
          else deps.cambiarAjustes?.((a) => ({ ...a, recordadas: { ...a.recordadas, [t.de]: r === "siempre" ? "permitir" : "denegar" } }));
        }
        veredicto = r === "permitir" || r === "siempre" ? "permitir" : "denegar";
        if (veredicto === "denegar") motivoPuerta = "otra-cuenta";
      }
      if (s.cerrada) return;
      if (veredicto === "permitir") {
        if (!ev.ok) return rechazar(ev.motivo);
        // PTA1110A · puerto público fuera de la web corriente con la política «Preguntar»: lo decide el dueño de esta puerta.
        if (ev.preguntarPuerto) {
          responder({ k: "esp", s: t.s });
          let r: Pregunta = "denegar";
          try {
            r = deps.preguntar ? await Promise.race([deps.preguntar(sol, `${t.host}:${t.port}`, "puerto"), esperar(plazoPregunta).then((): Pregunta => "denegar")]) : "denegar";
          } catch {
            r = "denegar";
          }
          if (r === "siempre") deps.cambiarAjustes?.((a) => ({ ...a, puertos: [...new Set([...a.puertos, t.port])].slice(-8) }));
          if (s.cerrada) return;
          if (r !== "permitir" && r !== "siempre") return rechazar("puerto-no-permitido");
        }
        let sock: SocketSalida;
        try {
          sock = await deps.abrirTcp(ev.destino ?? t.host, t.port, { permitirPrivadas: false, concedido: ev.concedido });
        } catch (e) {
          return rechazar(e instanceof Error && /^[a-z-]{3,30}$/.test(e.message) ? e.message : "no-conecta");
        }
        if (s.cerrada) {
          sock.cerrar();
          return;
        }
        s.socket = sock;
        s.abierta = true;
        sock.alDatos(async (b) => {
          if (s.cerrada || !s.a) return;
          if (!(await mandarDatos(s.a, s, b))) {
            if (s.cerrada) return; // PTA1110A: cerrada a propósito (p. ej. «solo Wi‑Fi») mientras llegaban datos del sitio
            throw new Error("tunel");
          }
          if (cuotaVencida(s)) cerrar(s, "cuota");
        });
        sock.alCerrar((e) => cerrar(s, e ? `socket:${e.slice(0, 30)}` : "fin"));
        responder(okTrama());
        return;
      }
    }

    // 2) ¿Puedo ser relé?
    // PTA1110B · Cada salto aplica SU política al ámbito de quien pide: ajustes, batería, cuota y túneles de ese ámbito (un relé no usa mi salida, pero sí mi batería y mi cuota).
    rotar();
    const tunelesAmbito = [...sesiones.values()].filter((x) => x.rol !== "cliente" && x.grupo === grupo && x !== s).length;
    const decRele = decidirServir(aj, sol, { conInternet: true, bateria: deps.estado().bateria, cargando: deps.estado().cargando, medida: false }, { bytesHoyGrupo: usoDe(grupo), tunelesGrupo: tunelesAmbito });
    const permiteRele = !aj.revocadas.includes(t.de) && decRele.veredicto === "permitir";
    if (t.ttl <= 0 || !permiteRele) return rechazar(t.ttl <= 0 ? motivoPuerta : "rele-no-permitido");
    s.rol = "rele";
    s.grupo = grupo;
    const excluir = new Set<string>([...t.via, vecino, t.de]);
    const fRele = capacidadesPropias();
    // PTA1110B: el siguiente salto recibe el ámbito YA recortado por este (nunca más ancho que el que yo concedí).
    const siguiente = { k: "abrir" as const, host: t.host, port: t.port, ttl: t.ttl - 1, via: [...t.via, yo], de: t.de, mc, am: amb.ambito, ...(amb.grupo ? { g: amb.grupo } : {}), ...(fRele ? { f: fRele } : {}) };
    let ultimo = "sin-puertas";
    for (let i = 0; i < MAX_INTENTOS_PUERTAS && !s.cerrada; i++) {
      const e = deps.tabla.elegir({ excluir, host: t.host, puerto: t.port, filtro: (x) => carrilPermitido(aj, x.tipoEnlace, x.enlace) && usable(x, aj) }); // PTA1108C · PTA1110A: carriles · PTA1110B: ámbitos de uso
      if (!e) break;
      excluir.add(e.anuncio.id);
      excluir.add(e.vecino);
      const r = await abrirHacia(s, e.vecino, siguiente);
      if (r.ok) {
        s.abierta = true;
        responder(okTrama());
        return;
      }
      ultimo = r.m;
      deps.tabla.marcarFallo(e.anuncio.id);
    }
    if (!s.cerrada) rechazar(ultimo);
  }

  /* ── Recepción ── */
  /** PTA1110B · La puerta `id` ya no tiene salida: se borra la ruta que iba por esta vecina, se cierra lo que iba por ella y se avisa. */
  function puertaPerdida(id: string, vecino: string): void {
    if (typeof id !== "string" || !id || id.length > 80 || id === yo) return;
    if (deps.tabla.vecinoDe(id) !== vecino) return; // otra ruta mejor puede seguir viva: no se toca
    deps.tabla.quitar(id);
    for (const c of [...sesiones.values()]) if (c.rol === "cliente" && c.info?.puerta === id) cerrar(c, "puerta-perdida");
    for (const v of T.vecinos()) if (v !== vecino) void T.enviar(v, { k: "retira", id }).catch(() => undefined);
  }

  function alTrama(vecino: string, t: Trama, meta: MetaVecino): void {
    if (!t || typeof t !== "object") return;
    metas.set(vecino, meta);
    switch (t.k) {
      case "retira":
        puertaPerdida(t.id, vecino);
        return;
      case "anuncio": {
        const a = leerAnuncio(t.a);
        if (!a) return;
        // No fiarse del `ts` ajeno: manda la hora local de recepción.
        if (deps.tabla.anotar(a, vecino, meta)) {
          const r = reanunciar(a, yo, ahora());
          if (r) for (const v of T.vecinos()) if (v !== vecino && !r.via.includes(v)) void T.enviar(v, { k: "anuncio", a: r }).catch(() => undefined);
        }
        return;
      }
      case "abrir":
        void alAbrir(vecino, t, meta);
        return;
      case "ok":
      case "esp":
      case "err": {
        const e = porLado.get(clave(vecino, t.s));
        if (!e || e.l !== e.s.b) return;
        if (t.k === "err") {
          if (e.s.abierta) cerrar(e.s, t.m || "err", e.l);
          else e.s.alApertura?.({ ok: false, m: typeof t.m === "string" ? t.m.slice(0, 40) : "err" });
        } else if (t.k === "esp") e.s.alApertura?.({ esp: true });
        else {
          if (e.l.ofrecioBin && Array.isArray(t.f) && t.f.includes("bin")) e.l.bin = true; // PTA1110A: el otro lado aceptó el binario
          e.s.alApertura?.({ ok: true });
        }
        return;
      }
      case "dat": {
        const e = porLado.get(clave(vecino, t.s));
        if (e && !e.s.cerrada) recibirDat(e.s, e.l, t);
        return;
      }
      case "ack": {
        const e = porLado.get(clave(vecino, t.s));
        if (e) recibirAck(e.l, t.n);
        return;
      }
      case "fin": {
        const e = porLado.get(clave(vecino, t.s));
        if (!e) return;
        if (!e.s.abierta && e.l === e.s.b) e.s.alApertura?.({ ok: false, m: typeof t.m === "string" ? t.m.slice(0, 40) : "fin" });
        else cerrar(e.s, typeof t.m === "string" ? t.m.slice(0, 40) : "fin", e.l);
        return;
      }
    }
  }

  function anunciar(): void {
    const a = deps.anuncioPropio();
    if (!a) return;
    for (const v of T.vecinos()) void T.enviar(v, { k: "anuncio", a }).catch(() => undefined);
  }

  function barrer(): void {
    deps.tabla.barrer();
    const t = ahora();
    // PTA1110A · Descargas que esperan un carril más rápido: siguen cuando lo hay; si no aparece, se cancelan.
    for (const s of sesiones.values()) {
      if (!s.esperaCarril) continue;
      const em = s.b ? emisores.get(s.b.vecino) : undefined;
      const kbps = em ? (bpsDe(em) * 8) / 1000 : 0;
      if (kbps >= 1000 || t - s.pausadaDesde > ESPERA_CARRIL_RAPIDO_MS) {
        const cancelar = kbps < 1000;
        s.esperaCarril = false;
        s.pausada = false;
        s.reanudar?.();
        if (cancelar) cerrar(s, "sin-carril-rapido");
      }
    }
    for (const s of [...sesiones.values()]) if (t - s.ultimo > inactividad) cerrar(s, "inactivo");
  }

  const comparten = (): Sesion[] => [...sesiones.values()].filter((s) => s.rol !== "cliente" && s.abierta);

  return {
    abrirTunel,
    revocar(id) {
      deps.cambiarAjustes?.((a) => (a.revocadas.includes(id) ? a : { ...a, revocadas: [...a.revocadas, id].slice(-200) }));
      for (const s of comparten()) if (s.de === id || s.a?.vecino === id) cerrar(s, "revocada");
    },
    detenerCompartir() {
      for (const s of comparten()) cerrar(s, "detenida");
    },
    compartiendo: () =>
      comparten().map((s) => ({ id: s.id, de: s.de, vecino: s.a?.vecino ?? "", host: s.host, grupo: s.ambito, ...(s.grupoId ? { grupoId: s.grupoId } : {}), rol: s.rol === "rele" ? "rele" : "puerta", bytes: s.bytes, desde: s.desde })),
    auditoria: () => ring.slice(),
    bytesHoy: (g) => (rotar(), g === "mias" ? uso.mias : uso.otras),
    bytesHoyDe: (c) => (rotar(), usoDe(c)),
    bytesHoyMovil: () => (rotar(), uso.movil),
    salidaPerdida() {
      // PTA1110B · Cambio de rol: lo que esta neurona servía hacia internet se corta YA (falla rápido; quien pidió abre otro por la nueva ruta).
      for (const c of [...sesiones.values()]) if (c.rol === "puerta" && c.haciaInternet) cerrar(c, "salida-perdida");
      for (const v of T.vecinos()) void T.enviar(v, { k: "retira", id: yo }).catch(() => undefined);
    },
    anunciar,
    barrer,
    iniciar() {
      if (baja) return;
      baja = T.alRecibir(alTrama);
      bajaBin = T.alRecibirBin?.(recibirBin) ?? null; // PTA1110A
      anunciar();
      reloj = setInterval(() => {
        barrer();
        anunciar();
      }, REANUNCIO_MS);
    },
    detener() {
      baja?.();
      baja = null;
      bajaBin?.(); // PTA1110A
      bajaBin = null;
      if (reloj) clearInterval(reloj);
      reloj = null;
      for (const s of [...sesiones.values()]) cerrar(s, "detenida");
    },
    actividad: () =>
      [...sesiones.values()]
        .filter((s) => s.abierta)
        .map((s) => ({
          id: s.id, rol: s.rol, tipo: s.tipo, host: s.host, puerto: s.puerto, bytes: s.bytes,
          bytesPorSegundo: ahora() - s.tVel > 2500 ? 0 : Math.round(s.vel),
          enlace: s.info?.enlace ?? s.enlace, vecino: (s.rol === "cliente" ? s.b?.vecino : s.a?.vecino) ?? "", de: s.de, desde: s.desde,
          pausada: s.pausada, esperandoCarril: s.esperaCarril,
        })),
    carriles: () =>
      [...emisores.values()].map((e) => ({
        vecino: e.vecino, kbps: Math.round((bpsDe(e) * 8) / 1000), bytesEnVuelo: e.bytesVuelo, ventana: e.wnd,
        rttMs: e.srtt ? Math.round(e.srtt) : null,
        tunelesActivos: [...sesiones.values()].filter((s) => s.abierta && (s.a?.vecino === e.vecino || s.b?.vecino === e.vecino)).length,
      })),
    pausar(id) {
      const s = sesiones.get(id);
      if (s && s.rol === "cliente") {
        s.pausada = true;
        s.pausadaDesde = ahora();
      }
    },
    reanudar(id) {
      const s = sesiones.get(id);
      if (!s) return;
      s.pausada = false;
      s.esperaCarril = false;
      s.reanudar?.();
    },
    cancelar(id) {
      const s = sesiones.get(id);
      if (s) cerrar(s, "cancelada");
    },
    tunelesPropios: () => [...sesiones.values()].filter((s) => s.rol === "cliente" && s.abierta && s.info).map((s) => ({ ...(s.info as { puerta: string; enlace: string; saltos: number }), vecino: s.b?.vecino ?? "" })),
  };
}
