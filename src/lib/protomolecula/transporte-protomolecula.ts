/**
 * transporte-protomolecula — sesión de molécula compartida sobre el transporte universal (F3).
 * Contrato: `architecture/protomolecula.md` §6.2/§6.3. Canal de aplicación: «protomolecula».
 * Confirmaciones P1 (`elementoDeOperacion`), gestos efímeros P0 (nunca se guardan), presencia P0
 * (quién mueve qué), ping/pong de latencia (p50/p95 solo con muestras suficientes) y la `t` de
 * cada operación desde el `RelojComun`, que no inventa precisión sin muestras. Todo inyectado:
 * en pruebas no hay red. Sin enlace, la interfaz dice «solo en este aparato».
 */
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";
import type { Sesion, Molecula, Operacion, Cambio, ParametroRef } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { RelojComun, EstadoReloj } from "@/lib/estaciones/reloj-comun";

export const CANAL_PROTO = "protomolecula";
export type ClaseMensajePm = "confirmacion" | "gesto" | "presencia" | "ping" | "pong";

/** Mensaje de sesión; viaja como `cuerpo` del `SobreMensaje` del transporte universal. */
export interface MensajePm {
  pm: 1;
  clase: ClaseMensajePm;
  sesion: string;
  de: string;
  /** Confirmación: elemento de sala (P1) y la operación completa para re-aplicarla. */
  elemento?: ElementoSala;
  op?: Operacion;
  /** Gesto efímero: parámetro que mueve y valor al vuelo. */
  param?: ParametroRef;
  valor?: number;
  /** Presencia: quién y qué está moviendo («atomoId::parametroId»). */
  quien?: string;
  mueve?: string;
  /** Ping (id y salida) / pong (id, salida, hora de quien responde). */
  ping?: { id: string; t0: number; t1?: number };
}

const CLASES: readonly ClaseMensajePm[] = ["confirmacion", "gesto", "presencia", "ping", "pong"];

export function esMensajePm(x: unknown): x is MensajePm {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.pm === 1 && CLASES.includes(o.clase as ClaseMensajePm) &&
    typeof o.sesion === "string" && o.sesion.length <= 80 &&
    typeof o.de === "string" && o.de.length <= 80;
}

export interface EnvioPm {
  ok: boolean;
  /** Enlace que llevó el envío («Aparato vinculado», «Relé del servidor»…). */
  etiqueta?: string;
}

export interface DepsEnlacePm {
  sesion: Sesion;
  miId: string;
  reloj: Pick<RelojComun, "ahora" | "horaLocal" | "estado">;
  /** Envía por el enlace elegido (el real usa `enviarMensaje` en «protomolecula»). */
  enviar: (m: MensajePm) => EnvioPm;
  recibir: (cb: (data: unknown) => void) => () => void;
}

export interface EstadoLatencia {
  estado: "medida" | "sin medir";
  p50Ms: number | null;
  p95Ms: number | null;
  muestras: number;
}

export interface PresenciaViva { de: string; nombre?: string; mueve?: string; ms: number }

export interface EnlacePm {
  /** Confirma una operación local: pone su `t` con el reloj común y la manda como elemento. */
  confirmar(op: Operacion, cambio: Cambio): void;
  gesto(ref: ParametroRef, valor: number): void;
  presencia(nombre?: string, mueve?: string): void;
  medir(): void;
  latencia(): EstadoLatencia;
  presencias(): PresenciaViva[];
  elementos(): ElementoSala[];
  /** Base fusionada con lo recibido, por `moleculaDesdeElementos`. */
  fusionar(base: Molecula): Molecula;
  alConfirmar(cb: (op: Operacion | null, elemento: ElementoSala) => void): () => void;
  alGesto(cb: (ref: ParametroRef, valor: number, de: string) => void): () => void;
  estadoReloj(): EstadoReloj;
  /** Por qué enlace fue el último envío. */
  etiqueta(): string;
  detener(): void;
}

export function etiquetaDeEnvio(r: EnvioPm | null | undefined): string {
  return r && r.ok && r.etiqueta ? `por ${r.etiqueta}` : "solo en este aparato";
}

const CADUCIDAD_PRESENCIA_MS = 30_000;
const MUESTRAS_MIN = 5;
const MAX_MUESTRAS = 64;

export function crearEnlaceSesion(deps: DepsEnlacePm): EnlacePm {
  const guardados = new Map<string, ElementoSala>();
  const presentes = new Map<string, PresenciaViva>();
  const pendientes = new Set<string>();
  const muestras: number[] = [];
  const confirmados = new Set<(op: Operacion | null, e: ElementoSala) => void>();
  const gestores = new Set<(ref: ParametroRef, valor: number, de: string) => void>();
  let ultimoEnvio: EnvioPm | null = null;

  const mandar = (m: Omit<MensajePm, "pm" | "sesion" | "de">) => {
    ultimoEnvio = deps.enviar({ pm: 1, sesion: deps.sesion.id, de: deps.miId, ...m });
  };

  const guardar = (e: ElementoSala) => {
    const previo = guardados.get(e.id);
    if (previo && (previo.actualizadoEn > e.actualizadoEn ||
      (previo.actualizadoEn === e.actualizadoEn && previo.porDispositivo <= e.porDispositivo))) return;
    guardados.set(e.id, e);
  };

  const emitir = <A extends unknown[]>(set: Set<(...args: A) => void>, ...args: A) => {
    for (const cb of set) { try { cb(...args); } catch { /* un oyente roto no para los demás */ } }
  };

  const alLlegar = (data: unknown) => {
    let m: unknown = data;
    if (typeof data === "string") { try { m = JSON.parse(data); } catch { return; } }
    if (!esMensajePm(m) || (m as MensajePm).sesion !== deps.sesion.id) return;
    const msg = m as MensajePm;
    if (msg.de === deps.miId) return; // nuestro eco de rebote
    switch (msg.clase) {
      case "confirmacion":
        if (msg.elemento) { guardar(msg.elemento); emitir(confirmados, msg.op ?? null, msg.elemento); }
        return;
      case "gesto":
        if (msg.param) emitir(gestores, msg.param, typeof msg.valor === "number" ? msg.valor : 0, msg.de);
        return;
      case "presencia":
        presentes.set(msg.de, { de: msg.de, nombre: msg.quien, mueve: msg.mueve, ms: deps.reloj.horaLocal() });
        return;
      case "ping":
        if (msg.ping && Number.isFinite(msg.ping.t0)) {
          mandar({ clase: "pong", ping: { id: msg.ping.id, t0: msg.ping.t0, t1: deps.reloj.horaLocal() } });
        }
        return;
      case "pong":
        if (msg.ping && pendientes.has(msg.ping.id)) {
          pendientes.delete(msg.ping.id); // ida y vuelta medida con MI hora de salida
          const rtt = deps.reloj.horaLocal() - msg.ping.t0;
          if (rtt >= 0) {
            muestras.push(rtt);
            if (muestras.length > MAX_MUESTRAS) muestras.shift();
          }
        }
        return;
    }
  };

  return {
    confirmar(op, cambio) {
      op.t = deps.reloj.ahora(); // la `t` de TODAS las operaciones sale del reloj común
      const elemento = elementoDeOperacion(op, cambio);
      guardar(elemento);
      mandar({ clase: "confirmacion", elemento, op });
    },
    gesto(param, valor) { mandar({ clase: "gesto", param, valor }); }, // efímero: no se guarda
    presencia(nombre, mueve) { mandar({ clase: "presencia", quien: nombre, mueve }); },
    medir() {
      const id = `pm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      if (pendientes.size >= 64) pendientes.delete(pendientes.keys().next().value as string);
      pendientes.add(id);
      mandar({ clase: "ping", ping: { id, t0: deps.reloj.horaLocal() } });
    },
    latencia(): EstadoLatencia {
      if (muestras.length < MUESTRAS_MIN) return { estado: "sin medir", p50Ms: null, p95Ms: null, muestras: muestras.length };
      const s = [...muestras].sort((a, b) => a - b);
      const en = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
      return { estado: "medida", p50Ms: en(0.5), p95Ms: en(0.95), muestras: s.length };
    },
    presencias() {
      const corte = deps.reloj.horaLocal() - CADUCIDAD_PRESENCIA_MS;
      return Array.from(presentes.values()).filter((p) => p.ms >= corte);
    },
    elementos: () => Array.from(guardados.values()),
    fusionar: (base) => moleculaDesdeElementos(base, Array.from(guardados.values())),
    alConfirmar(cb) { confirmados.add(cb); return () => confirmados.delete(cb); },
    alGesto(cb) { gestores.add(cb); return () => gestores.delete(cb); },
    estadoReloj: () => deps.reloj.estado(),
    etiqueta: () => etiquetaDeEnvio(ultimoEnvio),
    detener: deps.recibir(alLlegar),
  };
}

