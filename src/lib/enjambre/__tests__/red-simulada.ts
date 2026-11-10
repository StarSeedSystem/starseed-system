/**
 * Red simulada y determinista para las pruebas del Enjambre (ENJ1110A).
 * Tiempo virtual en ms, enlaces con capacidad (kbit/s) y latencia por sentido y por vía, cola por enlace
 * (un mensaje grande retrasa al siguiente), corte de nodos, mensajes que se pueden corromper al salir y un
 * «servidor HTTP» de espejo que contesta con retardo virtual. Nada de temporizadores reales.
 */

import { AlmacenMemoria } from "../almacen";
import { SesionEnjambre, type OpcionesSesion, type ViaInfo } from "../enjambre";
import type { FetchEspejo, RespuestaEspejo } from "../espejo";

interface Enlace {
  kbps: number;
  latMs: number;
  libreEn: number;
}

type Evento = { t: number; seq: number; tipo: "msg"; de: string; a: string; via: string; msg: Record<string, unknown> } | { t: number; seq: number; tipo: "fn"; fn: () => void | Promise<void> } | { t: number; seq: number; tipo: "tick" };

export interface Nodo {
  id: string;
  vivo: boolean;
  sesion: SesionEnjambre | null;
  almacen: AlmacenMemoria;
  /** Altera el mensaje al salir (para simular un par que miente). */
  interceptar?: (msg: Record<string, unknown>) => Record<string, unknown>;
  enviados: number;
}

const macrotarea = () => new Promise<void>((r) => setImmediate(r));

export class RedSim {
  t = 0;
  private cola: Evento[] = [];
  private seq = 0;
  private enlaces = new Map<string, Enlace>();
  private vias = new Map<string, ViaInfo[]>();
  readonly nodos = new Map<string, Nodo>();
  /** Todo lo que viajó (para comprobar fugas): [de, a, JSON]. */
  readonly trafico: Array<{ de: string; a: string; via: string; json: string }> = [];
  readonly bytesPorVia = new Map<string, number>();
  periodoTick = 500;

  async nodo(id: string, o: Omit<OpcionesSesion, "idPropio" | "almacen" | "transporte" | "reloj">, almacen = new AlmacenMemoria()): Promise<Nodo> {
    const n: Nodo = { id, vivo: true, sesion: null, almacen, enviados: 0 };
    this.nodos.set(id, n);
    n.sesion = await SesionEnjambre.crear({
      ...o,
      idPropio: id,
      almacen,
      reloj: () => this.t,
      transporte: { enviar: (par, via, msg) => this.enviar(id, par, via, msg) },
    });
    if (!n.sesion) throw new Error("sesión no creada");
    return n;
  }

  /** Enlaza dos nodos por una o varias vías (carril, kbit/s, ms). Las dos sesiones se enteran. */
  enlazar(a: string, b: string, vias: Array<{ via: string; kbps: number; latMs: number }>): void {
    for (const v of vias) {
      this.enlaces.set(`${a}>${b}|${v.via}`, { kbps: v.kbps, latMs: v.latMs, libreEn: 0 });
      this.enlaces.set(`${b}>${a}|${v.via}`, { kbps: v.kbps, latMs: v.latMs, libreEn: 0 });
    }
    const info: ViaInfo[] = vias.map((v) => ({ id: `${a}~${b}:${v.via}`, lana: v.via, capacidadKbps: v.kbps, latenciaMs: v.latMs }));
    this.vias.set(`${a}~${b}`, info);
    this.nodos.get(a)?.sesion?.conectarPar(b, info);
    this.nodos.get(b)?.sesion?.conectarPar(a, info.map((x) => ({ ...x })));
  }

  private claveEnlace(de: string, a: string, via: string): string {
    return `${de}>${a}|${via}`;
  }

  /** `via` del planificador es «a~b:carril»; el carril es lo que va tras los dos puntos. */
  private enviar(de: string, a: string, viaPlan: string | null, msg: Record<string, unknown>): void {
    const nodo = this.nodos.get(de);
    if (!nodo || !nodo.vivo) return;
    let carril = viaPlan ? viaPlan.slice(viaPlan.lastIndexOf(":") + 1) : "";
    if (!carril || !this.enlaces.has(this.claveEnlace(de, a, carril))) {
      const c = [...this.enlaces.keys()].filter((k) => k.startsWith(`${de}>${a}|`));
      if (!c.length) return;
      carril = c[0].split("|")[1];
    }
    const salida = nodo.interceptar ? nodo.interceptar(msg) : msg;
    const json = JSON.stringify(salida);
    const enl = this.enlaces.get(this.claveEnlace(de, a, carril))!;
    const inicio = Math.max(this.t, enl.libreEn);
    const dur = (json.length * 8) / enl.kbps;
    enl.libreEn = inicio + dur;
    nodo.enviados += json.length;
    const k = `${de}>${a}:${carril}`;
    this.bytesPorVia.set(k, (this.bytesPorVia.get(k) ?? 0) + json.length);
    this.trafico.push({ de, a, via: carril, json });
    this.programar({ t: inicio + dur + enl.latMs, seq: this.seq++, tipo: "msg", de, a, via: `${de}~${a}:${carril}`, msg: JSON.parse(json) as Record<string, unknown> });
  }

  private programar(e: Evento): void {
    this.cola.push(e);
  }

  /** Ejecuta `fn` en el instante virtual `t`. */
  en(t: number, fn: () => void | Promise<void>): void {
    this.programar({ t, seq: this.seq++, tipo: "fn", fn });
  }

  /** El nodo cae: deja de enviar y recibir, y sus vecinos quitan el par. */
  matar(id: string): void {
    const n = this.nodos.get(id);
    if (!n) return;
    n.vivo = false;
    for (const o of this.nodos.values()) if (o.vivo && o.id !== id) o.sesion?.quitarPar(id);
    void n.sesion?.cerrar();
  }

  /** Un «servidor HTTP» de espejo: contesta a `Range` con retardo virtual según su capacidad. */
  espejoHttp(datos: Uint8Array, o: { kbps: number; latMs: number; corromper?: boolean; capa?: Uint8Array; sinRange?: boolean }): FetchEspejo & { bytes: () => number; peticiones: () => number } {
    let servidos = 0;
    let n = 0;
    let libreEn = 0;
    const f: FetchEspejo = (url, init) =>
      new Promise<RespuestaEspejo>((resolver) => {
        n++;
        const esCapa = url.endsWith(".enj-capa");
        let cuerpo: Uint8Array;
        let status = 206;
        const headers: Record<string, string> = {};
        if (esCapa) {
          if (!o.capa) {
            cuerpo = new Uint8Array(0);
            status = 404;
          } else {
            cuerpo = o.capa;
            status = 200;
          }
        } else {
          const m = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range ?? "");
          if (!m) {
            status = 400;
            cuerpo = new Uint8Array(0);
          } else {
            const a = Number(m[1]);
            const b = Number(m[2]);
            cuerpo = datos.slice(a, b + 1);
            if (o.corromper) cuerpo[0] ^= 0xff;
            headers["content-range"] = `bytes ${a}-${b}/${datos.length}`;
            if (o.sinRange) status = 200;
          }
        }
        headers["content-length"] = String(cuerpo.length);
        const inicio = Math.max(this.t, libreEn);
        const dur = (cuerpo.length * 8) / o.kbps;
        libreEn = inicio + dur;
        servidos += status === 206 || status === 200 ? cuerpo.length : 0;
        const resp: RespuestaEspejo = { status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => cuerpo.buffer.slice(cuerpo.byteOffset, cuerpo.byteOffset + cuerpo.byteLength) as ArrayBuffer };
        this.en(inicio + dur + o.latMs, () => resolver(resp));
      });
    return Object.assign(f, { bytes: () => servidos, peticiones: () => n });
  }

  /** Corre hasta que `cond` sea verdad o pase `maxMs` de tiempo virtual. Devuelve el instante final. */
  async correr(maxMs: number, cond: () => boolean = () => false): Promise<number> {
    this.programar({ t: this.t + this.periodoTick, seq: this.seq++, tipo: "tick" });
    while (this.cola.length) {
      let mi = 0;
      for (let i = 1; i < this.cola.length; i++) {
        const a = this.cola[i];
        const b = this.cola[mi];
        if (a.t < b.t || (a.t === b.t && a.seq < b.seq)) mi = i;
      }
      const e = this.cola.splice(mi, 1)[0];
      if (e.t > maxMs) {
        this.t = maxMs;
        break;
      }
      this.t = Math.max(this.t, e.t);
      if (e.tipo === "msg") {
        const dest = this.nodos.get(e.a);
        if (dest?.vivo && this.nodos.get(e.de)?.vivo !== undefined) await dest.sesion?.alMensaje(e.de, e.via, e.msg);
      } else if (e.tipo === "fn") {
        await e.fn();
        await macrotarea();
      } else {
        for (const n of this.nodos.values()) if (n.vivo) n.sesion?.tick();
        if (cond()) break;
        this.programar({ t: this.t + this.periodoTick, seq: this.seq++, tipo: "tick" });
      }
      for (const n of this.nodos.values()) if (n.vivo) await n.sesion?.reposo();
      if (cond()) break;
    }
    return this.t;
  }
}

/** Bytes pseudoaleatorios deterministas (no comprimibles, distintos por semilla). */
export function bytesDePrueba(n: number, semilla = 1): Uint8Array {
  const out = new Uint8Array(n);
  let a = semilla >>> 0;
  for (let i = 0; i < n; i++) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    out[i] = a >>> 24;
  }
  return out;
}

export function iguales(a: Uint8Array | null, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
