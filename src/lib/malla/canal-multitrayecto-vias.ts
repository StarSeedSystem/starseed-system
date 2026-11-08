/**
 * canal-multitrayecto-vias — UN archivo por TODOS los caminos que llegan al destino a la vez (MPT1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Generaliza `canal-multitrayecto.ts` (varios enlaces al MISMO aparato) a vías de cualquier clase:
 *   · directas: Bluetooth, Wi‑Fi directo, TCP de la red local, WebRTC local;
 *   · de la cuenta o del par (WebRTC por la señal de la cuenta);
 *   · por RELÉ: otras neuronas de la cuenta, servidores propios y el relé de StarSeed (solo texto cifrado, ver
 *     `canal-sellado.ts`; con tope de bytes y, si lo lleva un tercero, solo con permiso);
 *   · un router/OpenWrt (interfaz; el adaptador real es un stub hasta que haya firmware).
 *
 * Reparto: selector ponderado suave con peso = capacidad medida (o la que se va midiendo con lo enviado) entre
 * (1 + latencia/250 ms), contrapresión por vía (una cola llena se salta en esa vuelta) y reequilibrio dinámico:
 * una vía que falla dos veces seguidas se da por muerta un rato (se reintenta después), una vía nueva entra en
 * el reparto sin parar la transferencia, y los últimos trozos que llevaba una vía muerta se reenvían por las demás
 * (el receptor ignora duplicados y reensambla por índice; el resto lo cubre el «huecos» del motor).
 *
 * Pensado para ir DEBAJO de `crearCanalSellado`: el sellado cifra, esto solo reparte. Sin DOM ni red propios.
 */

import { TAM_TROZO_POR_DEFECTO, trozoBinarioATexto, type CanalArchivos } from "@/lib/network/archivos-malla";
import { crearSelectorPonderado, pesosPorCapacidad, type SelectorPonderado } from "@/lib/malla/eleccion-enlace";
import { esTrozo, UMBRAL_COLA_MULTI, type CanalMultitrayecto } from "@/lib/malla/canal-multitrayecto";

export type TipoVia = "directa" | "cuenta" | "rele-neurona" | "rele-propio" | "rele-starseed" | "router";

export interface ViaMulti {
  id: string;
  tipo: TipoVia;
  canal: CanalArchivos;
  /** Nombre para la interfaz («Red local», «Wi‑Fi directo», «Bluetooth»…). */
  etiqueta?: string;
  /** kbps medidos; null = sin medir (se mide con lo que va pasando). */
  capacidadKbps?: number | null;
  /** ms de ida y vuelta; null = sin medir. */
  latenciaMs?: number | null;
  /** Lo lleva un tercero (relé de otra persona o servidor ajeno): solo con permiso. */
  tercero?: boolean;
}

export interface OpcionesMultiVias {
  umbralCola?: number;
  /** Permiso para usar vías de terceros (relés ajenos). Por defecto, no. */
  permitirTerceros?: boolean;
  /** Tope de bytes de ARCHIVO por cada vía de relé (0 = sin relés). Por defecto 64 MiB. */
  maxBytesRele?: number;
  /** Fallos seguidos para dar una vía por muerta. Por defecto 2. */
  fallosParaMuerta?: number;
  /** Cuánto se espera para volver a probar una vía muerta (ms). Por defecto 8000. */
  reintentoMuertaMs?: number;
  /** Cuántos trozos recientes por vía se recuerdan para reenviarlos si muere. Por defecto 24. */
  recientes?: number;
  ahora?: () => number;
}

export interface ParticipacionVia {
  id: string;
  etiqueta: string;
  tipo: TipoVia;
  trozos: number;
  bytes: number;
  /** 0..100 entero, la suma da 100. */
  porcentaje: number;
  muerta: boolean;
}

export interface CanalMultiVias extends CanalMultitrayecto {
  agregarVia(v: ViaMulti): void;
  quitarVia(id: string): void;
  /** Marca una vía como muerta (p. ej. el enlace cayó) y reenvía por las demás lo último que llevaba. */
  marcarMuerta(id: string): void;
  actualizarVia(id: string, cambios: { capacidadKbps?: number | null; latenciaMs?: number | null }): void;
  participacion(): ParticipacionVia[];
  /** Bytes/s de archivo enviados en la última ventana. */
  velocidadBps(): number;
  /** «LAN 72 % · Wi‑Fi directo 20 % · Bluetooth 8 %». */
  resumenVias(): { texto: string; bps: number } | null;
}

const MAX_BYTES_RELE = 64 * 1024 * 1024;
const VENTANA_VELOCIDAD_MS = 4000;
const ETIQUETA_POR_TIPO: Record<TipoVia, string> = {
  directa: "Enlace directo",
  cuenta: "Cuenta",
  "rele-neurona": "Relé por tus neuronas",
  "rele-propio": "Servidor propio",
  "rele-starseed": "Relé de StarSeed",
  router: "Router",
};

/** Texto del reparto para la interfaz. Puro. */
export function textoReparto(partes: Array<{ etiqueta: string; porcentaje: number }>): string {
  return partes
    .filter((p) => p.porcentaje > 0)
    .sort((a, b) => b.porcentaje - a.porcentaje)
    .map((p) => `${p.etiqueta} ${p.porcentaje} %`)
    .join(" · ");
}

/** Porcentajes enteros que suman 100 (mayor resto). Puro. */
export function porcentajes(valores: number[]): number[] {
  const total = valores.reduce((s, v) => s + v, 0);
  if (total <= 0) return valores.map(() => 0);
  const exactos = valores.map((v) => (v * 100) / total);
  const base = exactos.map(Math.floor);
  let falta = 100 - base.reduce((s, v) => s + v, 0);
  const orden = exactos.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; falta > 0 && orden.length; k = (k + 1) % orden.length, falta--) base[orden[k].i]++;
  return base;
}

interface Estado {
  v: ViaMulti;
  trozos: number;
  bytes: number;
  fallos: number;
  muertaHasta: number;
  /** Capacidad estimada (kbps) cuando no hay medida; la fija `actualizarVia` o quien mide el enlace. */
  estimadaKbps: number | null;
  recientes: Array<{ buf?: ArrayBuffer; texto?: string }>;
  baja: (() => void) | null;
}

export function crearCanalMultiVias(vias: ViaMulti[], opts: OpcionesMultiVias = {}): CanalMultiVias {
  const ahora = opts.ahora ?? (() => Date.now());
  const umbral = opts.umbralCola ?? UMBRAL_COLA_MULTI;
  const fallosMax = opts.fallosParaMuerta ?? 2;
  const reintentoMs = opts.reintentoMuertaMs ?? 8000;
  const maxRecientes = opts.recientes ?? 24;
  const maxRele = opts.maxBytesRele ?? MAX_BYTES_RELE;

  const estados = new Map<string, Estado>();
  const oyentes = new Set<(d: string | ArrayBuffer) => void>();
  const muestras: Array<{ t: number; b: number }> = [];
  let selector: SelectorPonderado | null = null;
  let firmaSelector = "";

  const esRele = (t: TipoVia): boolean => t === "rele-neurona" || t === "rele-propio" || t === "rele-starseed";

  const suscribir = (e: Estado): void => {
    if (!oyentes.size || e.baja) return;
    try {
      e.baja = e.v.canal.alMensaje((d) => {
        for (const cb of Array.from(oyentes)) {
          try {
            cb(d);
          } catch {
            /* noop */
          }
        }
      });
    } catch {
      e.baja = null;
    }
  };

  const agregar = (v: ViaMulti): void => {
    if (!v || !v.canal || typeof v.canal.enviar !== "function" || estados.has(v.id)) return;
    const e: Estado = { v, trozos: 0, bytes: 0, fallos: 0, muertaHasta: 0, estimadaKbps: null, recientes: [], baja: null };
    estados.set(v.id, e);
    suscribir(e);
    firmaSelector = ""; // se recompone el reparto
  };
  for (const v of vias) agregar(v);

  const cola = (e: Estado): number => {
    try {
      return e.v.canal.bufferedAmount?.() ?? 0;
    } catch {
      return 0;
    }
  };
  const arriba = (e: Estado): boolean => {
    try {
      return e.v.canal.enlaceArriba ? e.v.canal.enlaceArriba() : true;
    } catch {
      return true;
    }
  };

  /** ¿Puede llevar trozos AHORA? (permitida, viva, con enlace y dentro de su tope de relé). */
  const elegible = (e: Estado): boolean => {
    if (e.v.tercero && !opts.permitirTerceros) return false;
    if (esRele(e.v.tipo) && e.bytes >= maxRele) return false;
    if (e.muertaHasta > ahora()) return false;
    return arriba(e);
  };

  const pesoDe = (e: Estado): number | null => {
    const c = e.v.capacidadKbps ?? e.estimadaKbps;
    if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) return null;
    const lat = e.v.latenciaMs;
    return c / (1 + (typeof lat === "number" && lat > 0 ? lat : 0) / 250);
  };

  const selectorActual = (): SelectorPonderado => {
    const el = Array.from(estados.values()).filter(elegible);
    const pesos = pesosPorCapacidad(el.map((e) => ({ id: e.v.id, capacidadKbps: pesoDe(e) })));
    // Se recompone solo si cambió el conjunto o un peso cambió de verdad (más de un 10 %).
    const firma = pesos.map((p) => `${p.id}:${Math.round(Math.log(Math.max(p.peso, 1e-6)) / Math.log(1.1))}`).join("|");
    if (!selector || firma !== firmaSelector) {
      selector = crearSelectorPonderado(pesos);
      firmaSelector = firma;
    }
    return selector;
  };

  const anotarVelocidad = (bytes: number): void => {
    const t = ahora();
    muestras.push({ t, b: bytes });
    while (muestras.length && muestras[0].t < t - VENTANA_VELOCIDAD_MS) muestras.shift();
  };

  const recordarReciente = (e: Estado, item: { buf?: ArrayBuffer; texto?: string }): void => {
    if (maxRecientes <= 0) return;
    e.recientes.push(item);
    while (e.recientes.length > maxRecientes) e.recientes.shift();
  };

  const matar = (e: Estado): void => {
    e.muertaHasta = ahora() + reintentoMs;
    e.fallos = 0;
    firmaSelector = "";
    reenviar(e.recientes.splice(0));
  };

  /** Reenvío por las demás vías; si no hay ninguna, el «huecos» del motor lo recupera. */
  const reenviar = (huerfanos: Array<{ buf?: ArrayBuffer; texto?: string }>): void => {
    for (const h of huerfanos) {
      enviarTrozo((x) => (h.buf !== undefined ? mandarBin(x, h.buf) : !!h.texto && x.v.canal.enviar(h.texto)), h, true);
    }
  };

  const mandarBin = (e: Estado, buf: ArrayBuffer): boolean => {
    if (typeof e.v.canal.enviarBinario === "function") return !!e.v.canal.enviarBinario(buf);
    const t = trozoBinarioATexto(buf);
    return !!t && e.v.canal.enviar(t);
  };

  /** Un trozo por la siguiente vía que pueda; las demás de reserva si una falla. */
  function enviarTrozo(mandar: (e: Estado) => boolean, item: { buf?: ArrayBuffer; texto?: string }, reenvio = false): boolean {
    const peso = item.buf?.byteLength ?? item.texto?.length ?? 0;
    const lista = Array.from(estados.values());
    // Una vía que dejó de tener enlace con trozos en vuelo: se da por muerta y se reenvía lo que llevaba.
    for (const e of lista) if (e.recientes.length && e.muertaHasta <= ahora() && !arriba(e)) matar(e);
    const saltar = new Set<string>();
    for (const e of lista) if (!elegible(e)) saltar.add(e.v.id);
    const elegibles = lista.filter((e) => !saltar.has(e.v.id));
    if (!elegibles.length) {
      // Sin vías elegibles: se prueba la que menos tiempo lleva muerta (puede haber vuelto) antes de rendirse.
      const candidata = lista.filter((e) => !(e.v.tercero && !opts.permitirTerceros)).sort((a, b) => a.muertaHasta - b.muertaHasta)[0];
      if (!candidata) return false;
      saltar.clear();
      for (const e of lista) if (e !== candidata) saltar.add(e.v.id);
    } else {
      for (const e of elegibles) if (cola(e) > umbral) saltar.add(e.v.id);
      if (saltar.size >= lista.length || elegibles.every((e) => saltar.has(e.v.id))) {
        for (const e of elegibles) saltar.delete(e.v.id); // todas llenas: el motor ya esperó
      }
    }
    const sel = selectorActual();
    for (let i = 0; i < lista.length; i++) {
      const id = sel.siguiente(saltar) ?? lista.map((e) => e.v.id).find((x) => !saltar.has(x)) ?? null;
      if (!id) break;
      const e = estados.get(id);
      let ok = false;
      try {
        ok = !!e && mandar(e);
      } catch {
        ok = false;
      }
      if (ok && e) {
        e.fallos = 0;
        e.muertaHasta = 0;
        e.trozos++;
        e.bytes += peso;
        recordarReciente(e, item);
        if (!reenvio) anotarVelocidad(peso);
        return true;
      }
      saltar.add(id);
      if (e) {
        e.fallos++;
        if (e.fallos >= fallosMax) matar(e);
      }
    }
    return false;
  }

  const enviarControl = (texto: string): boolean => {
    const orden = Array.from(estados.values())
      .filter((e) => !(e.v.tercero && !opts.permitirTerceros))
      .sort((a, b) => Number(!elegible(a)) - Number(!elegible(b)) || (a.v.latenciaMs ?? 1e9) - (b.v.latenciaMs ?? 1e9));
    for (const e of orden) {
      try {
        if (e.v.canal.enviar(texto)) return true;
      } catch {
        /* siguiente */
      }
    }
    return false;
  };

  const tamanoTrozo = (): number => {
    let menor = Infinity;
    for (const e of estados.values()) {
      if (!elegible(e)) continue;
      let t: unknown;
      try {
        t = e.v.canal.tamanoTrozo?.();
      } catch {
        t = undefined;
      }
      menor = Math.min(menor, typeof t === "number" && Number.isFinite(t) && t > 0 ? t : TAM_TROZO_POR_DEFECTO);
    }
    return Number.isFinite(menor) ? menor : TAM_TROZO_POR_DEFECTO;
  };

  const algunoBinario = (): boolean => Array.from(estados.values()).some((e) => typeof e.v.canal.enviarBinario === "function");

  const participacion = (): ParticipacionVia[] => {
    const lista = Array.from(estados.values());
    const pct = porcentajes(lista.map((e) => e.trozos));
    return lista.map((e, i) => ({
      id: e.v.id,
      etiqueta: e.v.etiqueta ?? ETIQUETA_POR_TIPO[e.v.tipo],
      tipo: e.v.tipo,
      trozos: e.trozos,
      bytes: e.bytes,
      porcentaje: pct[i],
      muerta: e.muertaHasta > ahora() || !arriba(e),
    }));
  };

  const velocidadBps = (): number => {
    const t = ahora();
    while (muestras.length && muestras[0].t < t - VENTANA_VELOCIDAD_MS) muestras.shift();
    if (!muestras.length) return 0;
    const total = muestras.reduce((s, m) => s + m.b, 0);
    const span = Math.max(1000, t - muestras[0].t);
    return (total * 1000) / span;
  };

  const canal: CanalMultiVias = {
    enviar(texto: string): boolean {
      if (!estados.size) return false;
      if (esTrozo(texto)) return enviarTrozo((e) => e.v.canal.enviar(texto), { texto });
      return enviarControl(texto);
    },
    tamanoTrozo,
    get enviarBinario() {
      return algunoBinario() ? (buf: ArrayBuffer): boolean => enviarTrozo((e) => mandarBin(e, buf), { buf }) : undefined;
    },
    bufferedAmount(): number {
      const el = Array.from(estados.values()).filter(elegible);
      if (!el.length) return 0;
      return Math.min(...el.map(cola));
    },
    alMensaje(cb) {
      oyentes.add(cb);
      for (const e of estados.values()) suscribir(e);
      return () => {
        oyentes.delete(cb);
        if (!oyentes.size) {
          for (const e of estados.values()) {
            try {
              e.baja?.();
            } catch {
              /* noop */
            }
            e.baja = null;
          }
        }
      };
    },
    reparto: () => Object.fromEntries(Array.from(estados.values()).map((e) => [e.v.id, e.trozos])),
    enlaces: () => Array.from(estados.keys()),
    agregarVia: agregar,
    quitarVia(id) {
      const e = estados.get(id);
      if (!e) return;
      try {
        e.baja?.();
      } catch {
        /* noop */
      }
      estados.delete(id);
      firmaSelector = "";
      reenviar(e.recientes.splice(0)); // lo último que llevaba, por las demás
    },
    marcarMuerta(id) {
      const e = estados.get(id);
      if (e) matar(e);
    },
    actualizarVia(id, cambios) {
      const e = estados.get(id);
      if (!e) return;
      if ("capacidadKbps" in cambios) e.v.capacidadKbps = cambios.capacidadKbps;
      if ("latenciaMs" in cambios) e.v.latenciaMs = cambios.latenciaMs;
    },
    participacion,
    velocidadBps,
    resumenVias() {
      const p = participacion();
      if (!p.some((x) => x.trozos > 0)) return null;
      return { texto: textoReparto(p), bps: velocidadBps() };
    },
  };
  return canal;
}
