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
  decidirServir,
  hostPermitidoParaOtras,
  type AjustesPuerta,
  type EstadoPropio,
  type Solicitante,
} from "@/lib/malla/puerta/politica";
import { evaluarDestino, type CapaPuerta, type Concesion } from "@/lib/malla/puerta/capas"; // PTA1108C
import { MAX_SALTOS, REANUNCIO_MS, TablaPuertas, leerAnuncio, reanunciar, type AnuncioPuerta, type EstimacionEnlace } from "@/lib/malla/puerta/tabla";

/* ───────────────────────── Tramas ───────────────────────── */

export type Trama =
  | { k: "anuncio"; a: AnuncioPuerta }
  | { k: "abrir"; s: string; host: string; port: number; ttl: number; via: string[]; de: string; mc: boolean }
  | { k: "esp"; s: string }
  | { k: "ok"; s: string }
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
  grupo: "mias" | "otras" | "publica";
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
  preguntar?: (s: Solicitante, host: string) => Promise<Pregunta>;
  ahora?: () => number;
  nuevoId?: () => string;
  esperar?: (ms: number) => Promise<void>;
  plazoAperturaMs?: number;
  plazoPreguntaMs?: number;
  plazoAckMs?: number;
  inactividadMs?: number;
  ventana?: number;
}

export interface TunelCliente {
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
  grupo: "mias" | "otras" | "publica";
  rol: "puerta" | "rele";
  bytes: number;
  desde: number;
}

export interface GestorPuerta {
  abrirTunel(host: string, port: number, o?: { evitarMedida?: boolean; excluir?: string[] }): Promise<TunelCliente | { error: string }>;
  /** Cierra y veta a una neurona. */
  revocar(id: string): void;
  /** Cierra todo lo que se comparte (botón «Parar»). */
  detenerCompartir(): void;
  compartiendo(): ResumenCompartiendo[];
  auditoria(): AuditoriaPuerta[];
  bytesHoy(grupo: "mias" | "otras"): number;
  anunciar(): void;
  barrer(): void;
  iniciar(): void;
  detener(): void;
  /** Túneles propios abiertos. */
  tunelesPropios(): { puerta: string; enlace: string; saltos: number }[];
}

/* ───────────────────────── Constantes ───────────────────────── */

const VENTANA = 8;
const TROZO = 8 * 1024;
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
  if (!aj.puertos.includes(port)) return "puerto-no-permitido";
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
  grupo: "mias" | "otras" | "publica";
  desde: number;
  ultimo: number;
  socket?: SocketSalida;
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

  const sesiones = new Map<string, Sesion>();
  const porLado = new Map<string, { s: Sesion; l: Lado }>();
  const ring: AuditoriaPuerta[] = [];
  const uso = { dia: "", mias: 0, otras: 0 };
  let baja: (() => void) | null = null;
  let reloj: ReturnType<typeof setInterval> | null = null;

  const diaDe = (t: number): string => new Date(t).toISOString().slice(0, 10);
  const rotar = (): void => {
    const d = diaDe(ahora());
    if (d !== uso.dia) {
      uso.dia = d;
      uso.mias = 0;
      uso.otras = 0;
    }
  };
  const contar = (g: Sesion["grupo"], n: number): void => {
    rotar();
    if (g === "mias") uso.mias += n;
    else uso.otras += n;
  };
  const tamTrozo = (v: string): number => Math.max(512, Math.min(TROZO, T.tamTrozo?.(v) ?? TROZO));

  /* ── Lados ── */
  function nuevoLado(vecino: string, sid: string): Lado {
    return { vecino, sid, tx: 0, acked: -1, rx: 0, reorden: new Map(), esperando: [], drenando: false, cola: Promise.resolve(true) };
  }
  function registrar(s: Sesion, l: Lado): void {
    porLado.set(clave(l.vecino, l.sid), { s, l });
  }
  function soltarLado(l: Lado | null): void {
    if (!l) return;
    porLado.delete(clave(l.vecino, l.sid));
    for (const f of l.esperando.splice(0)) f();
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

  /** Espera hueco en la ventana; false si venció el plazo de acuses o se cerró. */
  function esperarHueco(l: Lado, s: Sesion): Promise<boolean> {
    return new Promise<boolean>((res) => {
      let hecho = false;
      const fin = (v: boolean): void => {
        if (hecho) return;
        hecho = true;
        res(v);
      };
      const t = setTimeout(() => fin(false), plazoAck);
      l.esperando.push(() => {
        clearTimeout(t);
        fin(!s.cerrada);
      });
    });
  }

  function mandarDatos(l: Lado, s: Sesion, datos: Uint8Array): Promise<boolean> {
    const tarea = async (): Promise<boolean> => {
      const tam = tamTrozo(l.vecino);
      for (let o = 0; o < datos.length; o += tam) {
        if (s.cerrada) return false;
        const parte = datos.subarray(o, Math.min(datos.length, o + tam));
        while (l.tx - 1 - l.acked >= ventana) {
          if (!(await esperarHueco(l, s))) {
            cerrar(s, "sin-acuse");
            return false;
          }
        }
        const n = l.tx++;
        if (!(await mandarTrama(l.vecino, { k: "dat", s: l.sid, n, b: aB64(parte) }))) {
          cerrar(s, "enlace-caido");
          return false;
        }
        s.bytes += parte.length;
        s.ultimo = ahora();
        if (s.rol !== "cliente") contar(s.grupo, parte.length);
      }
      return true;
    };
    l.cola = l.cola.then(tarea, tarea);
    return l.cola;
  }

  async function entregar(s: Sesion, l: Lado, bytes: Uint8Array): Promise<void> {
    s.ultimo = ahora();
    if (s.rol === "puerta") {
      contar(s.grupo, bytes.length);
      s.bytes += bytes.length;
      await s.socket?.escribir(bytes);
      if (cuotaVencida(s)) cerrar(s, "cuota");
    } else if (s.rol === "rele") {
      const otro = l === s.a ? s.b : s.a;
      if (!otro || !(await mandarDatos(otro, s, bytes))) throw new Error("rele");
    } else if (s.datos) await s.datos(bytes);
    else if (s.backlog.length < 256) s.backlog.push(bytes);
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
        void mandarTrama(l.vecino, { k: "ack", s: l.sid, n });
      }
    } finally {
      l.drenando = false;
    }
    if (!s.cerrada && l.reorden.has(l.rx)) void drenar(s, l);
  }

  function recibirDat(s: Sesion, l: Lado, t: Extract<Trama, { k: "dat" }>): void {
    if (typeof t.n !== "number" || !Number.isInteger(t.n) || t.n < 0 || typeof t.b !== "string") return;
    if (t.n < l.rx) {
      void mandarTrama(l.vecino, { k: "ack", s: l.sid, n: l.rx - 1 }); // duplicado: se vuelve a acusar
      return;
    }
    if (t.n >= l.rx + 4 * ventana) return; // fuera de ventana
    const bytes = deB64(t.b);
    if (!bytes) return;
    l.reorden.set(t.n, bytes);
    void drenar(s, l);
  }

  function recibirAck(l: Lado, n: number): void {
    if (typeof n !== "number" || n <= l.acked) return;
    l.acked = n;
    for (const f of l.esperando.splice(0)) f();
  }

  /* ── Cierre, cuotas y auditoría ── */
  function cuotaVencida(s: Sesion): boolean {
    if (s.rol === "cliente") return false;
    rotar();
    const a = deps.ajustes();
    return s.grupo === "mias" ? uso.mias >= a.topesMias.bytesDia : uso.otras >= a.topesOtras.bytesDia;
  }

  function auditar(s: Sesion, resultado: string): void {
    if (s.rol === "cliente") return;
    ring.push({ t: s.desde, de: s.de, vecino: s.a?.vecino ?? "", host: s.host, puerto: s.puerto, bytes: s.bytes, grupo: s.grupo, resultado, ms: ahora() - s.desde });
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

  /* ── Cliente ── */
  async function abrirTunel(host: string, port: number, o: { evitarMedida?: boolean; excluir?: string[] } = {}): Promise<TunelCliente | { error: string }> {
    if (!deps.ajustes().usarPuertas) return { error: "desactivado" };
    if (sesiones.size >= MAX_SESIONES) return { error: "demasiados-tuneles" };
    const probadas = new Set<string>(o.excluir ?? []);
    let ultimo = "sin-puertas";
    for (let i = 0; i < MAX_INTENTOS_PUERTAS; i++) {
      const e = deps.tabla.elegir({ excluir: probadas, evitarMedida: o.evitarMedida, host, puerto: port }); // PTA1108C: la puerta que tenga la capa del destino
      if (!e) break;
      probadas.add(e.anuncio.id);
      const s: Sesion = {
        id: nuevoId(), rol: "cliente", a: null, b: null, cerrada: false, abierta: false, de: yo, host, puerto: port,
        bytes: 0, grupo: "mias", desde: ahora(), ultimo: ahora(), backlog: [],
        info: { puerta: e.anuncio.id, enlace: e.enlace, saltos: e.anuncio.saltos },
      };
      sesiones.set(s.id, s);
      const r = await abrirHacia(s, e.vecino, { k: "abrir", host, port, ttl: e.anuncio.saltos, via: [yo], de: yo, mc: true });
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
    return { error: ultimo === "sin-puertas" && destinoInterno(host) ? "sin-capa" : ultimo };
  }

  function tunelDe(s: Sesion): TunelCliente {
    const info = s.info as { puerta: string; enlace: string; saltos: number };
    return {
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
    const mc = t.mc === true && meta.mismaCuenta;
    const sol: Solicitante = { id: t.de, mismaCuenta: mc };
    const grupo: Sesion["grupo"] = mc ? "mias" : "otras";
    const s: Sesion = {
      id: nuevoId(), rol: "puerta", a: nuevoLado(vecino, t.s), b: null, cerrada: false, abierta: false, de: t.de, host: String(t.host).slice(0, 253),
      puerto: Number(t.port) || 0, bytes: 0, grupo, desde: ahora(), ultimo: ahora(), backlog: [],
    };
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

    // 1) ¿Puedo ser la puerta?
    let motivoPuerta = "sin-salida";
    if (deps.abrirTcp && !aReleSinCapa) {
      rotar();
      const gruposSes = [...sesiones.values()].filter((x) => x.rol === "puerta" && x.grupo === grupo && x !== s).length;
      // Una capa privada no gasta internet ni red medida: se sirve aunque esta neurona no tenga salida a internet.
      const estServir = ev.ok && ev.capa ? { ...deps.estado(), conInternet: true, medida: false } : deps.estado();
      const dec = decidirServir(aj, sol, estServir, { bytesHoyGrupo: grupo === "mias" ? uso.mias : uso.otras, tunelesGrupo: gruposSes });
      motivoPuerta = dec.motivo;
      let veredicto = dec.veredicto;
      if (veredicto === "preguntar") {
        responder({ k: "esp", s: t.s });
        let r: Pregunta = "denegar";
        try {
          r = deps.preguntar ? await Promise.race([deps.preguntar(sol, String(t.host)), esperar(plazoPregunta).then((): Pregunta => "denegar")]) : "denegar";
        } catch {
          r = "denegar";
        }
        if (r === "siempre" || r === "nunca") deps.cambiarAjustes?.((a) => ({ ...a, recordadas: { ...a.recordadas, [t.de]: r === "siempre" ? "permitir" : "denegar" } }));
        veredicto = r === "permitir" || r === "siempre" ? "permitir" : "denegar";
        if (veredicto === "denegar") motivoPuerta = "otra-cuenta";
      }
      if (s.cerrada) return;
      if (veredicto === "permitir") {
        if (!ev.ok) return rechazar(ev.motivo);
        let sock: SocketSalida;
        try {
          sock = await deps.abrirTcp(t.host, t.port, { permitirPrivadas: false, concedido: ev.concedido });
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
          if (!(await mandarDatos(s.a, s, b))) throw new Error("tunel");
          if (cuotaVencida(s)) cerrar(s, "cuota");
        });
        sock.alCerrar((e) => cerrar(s, e ? `socket:${e.slice(0, 30)}` : "fin"));
        responder({ k: "ok", s: t.s });
        return;
      }
    }

    // 2) ¿Puedo ser relé?
    const permiteRele = !aj.revocadas.includes(t.de) && (mc ? aj.misNeuronas : aj.otrasCuentas === "automatico" || aj.recordadas[t.de] === "permitir");
    if (t.ttl <= 0 || !permiteRele) return rechazar(t.ttl <= 0 ? motivoPuerta : "rele-no-permitido");
    s.rol = "rele";
    s.grupo = grupo;
    const excluir = new Set<string>([...t.via, vecino, t.de]);
    const siguiente = { k: "abrir" as const, host: t.host, port: t.port, ttl: t.ttl - 1, via: [...t.via, yo], de: t.de, mc };
    let ultimo = "sin-puertas";
    for (let i = 0; i < MAX_INTENTOS_PUERTAS && !s.cerrada; i++) {
      const e = deps.tabla.elegir({ excluir, host: t.host, puerto: t.port }); // PTA1108C
      if (!e) break;
      excluir.add(e.anuncio.id);
      excluir.add(e.vecino);
      const r = await abrirHacia(s, e.vecino, siguiente);
      if (r.ok) {
        s.abierta = true;
        responder({ k: "ok", s: t.s });
        return;
      }
      ultimo = r.m;
      deps.tabla.marcarFallo(e.anuncio.id);
    }
    if (!s.cerrada) rechazar(ultimo);
  }

  /* ── Recepción ── */
  function alTrama(vecino: string, t: Trama, meta: MetaVecino): void {
    if (!t || typeof t !== "object") return;
    switch (t.k) {
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
        else e.s.alApertura?.({ ok: true });
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
      comparten().map((s) => ({ id: s.id, de: s.de, vecino: s.a?.vecino ?? "", host: s.host, grupo: s.grupo, rol: s.rol === "rele" ? "rele" : "puerta", bytes: s.bytes, desde: s.desde })),
    auditoria: () => ring.slice(),
    bytesHoy: (g) => (rotar(), g === "mias" ? uso.mias : uso.otras),
    anunciar,
    barrer,
    iniciar() {
      if (baja) return;
      baja = T.alRecibir(alTrama);
      anunciar();
      reloj = setInterval(() => {
        barrer();
        anunciar();
      }, REANUNCIO_MS);
    },
    detener() {
      baja?.();
      baja = null;
      if (reloj) clearInterval(reloj);
      reloj = null;
      for (const s of [...sesiones.values()]) cerrar(s, "detenida");
    },
    tunelesPropios: () => [...sesiones.values()].filter((s) => s.rol === "cliente" && s.abierta && s.info).map((s) => s.info as { puerta: string; enlace: string; saltos: number }),
  };
}
