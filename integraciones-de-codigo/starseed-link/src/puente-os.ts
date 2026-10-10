/**
 * puente-os — `puenteOS()`: el lado de la APP del puente `postMessage` con StarSeed OS (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cuando la app oficial se abre DENTRO del OS (su marco en `/omnifrecuencias`, `/audiomorphic` o
 * una ventana del escritorio), el OS ya está conectado a la red, tiene la cuenta y mide el reloj
 * común. La app le habla por aquí con el protocolo v1 del OS
 * (`src/lib/estaciones/puente-omnifrecuencias.ts`): `{ ss: "estacion", v: 1, tipo, … }`.
 *
 *   app → OS                                     OS → app
 *   hola {app, suena}                            bienvenida {os, capacidades, estacion}
 *   latido {suena}                               —
 *   reloj-ping {id, t0}                          reloj-pong {id, t0, t1, t2, comun}
 *   crear {titulo, enlace, params|osciladores,   creada {id, enlace, enlaceControl, directorio}
 *          volumen, privada}                     o error {motivo}
 *   sintonizar {enlace}                          estado {estacion}   (≤ 4 por segundo)
 *   accion {accion, params?, volumen?}           resultado {ok, motivo?}
 *   salir {}                                     estado {estacion: null}
 *
 * Seguridad: solo se atienden mensajes del marco PADRE y de un origen permitido; hasta que el OS
 * contesta el saludo solo sale el saludo (sin nada privado) y después todo va SOLO a ese origen.
 * El OS, por su parte, solo atiende a las webs oficiales y a los orígenes de desarrollo declarados.
 */

import type { OsciladorApp, ParametrosSesion } from "./modelo";

export const VERSION_PUENTE = 1;

/** Orígenes de StarSeed OS a los que se habla (añade el tuyo si despliegas el OS en otro sitio). */
export const ORIGENES_OS: readonly string[] = ["https://starseed-os.vercel.app", "http://localhost:9002", "http://localhost:3000"];

/** Lo que el OS manda de la estación (sin llaves ni tokens). */
export interface EstacionDelOS {
  id: string;
  titulo: string;
  fuente: string;
  enlaceEntonacion: string;
  privada: boolean;
  fase: "esperando" | "sonando" | "pausada" | "terminada";
  /** Instante común en que la reproducción valdría 0 (mientras suena). */
  ancla: number | null;
  posicionMs: number;
  params: ParametrosSesion;
  volumen: number;
  control: boolean;
  reloj: { modo: string; precisionMs: number | null; cotaMs: number | null };
  conectados: number | null;
  ahoraComun: number;
}

export interface CreadaPorOS {
  id: string;
  enlace: string;
  enlaceControl: string;
  directorio: string;
}

type Mensaje = { ss: "estacion"; v: number; tipo: string; [k: string]: unknown };

/** ¿La app está dentro de un marco (el OS u otra web)? */
export function dentroDeUnMarco(): boolean {
  try {
    return typeof window !== "undefined" && window.parent !== window;
  } catch {
    return true; // un marco de otro origen lanza al mirar: estamos dentro de algo
  }
}

export interface OpcionesPuente {
  /** Id de la app («omnifrecuencias», «audiomorphic»…). */
  app: string;
  /** La app genera ella misma el sonido o la imagen: el OS se calla en esa pestaña. */
  suena?: boolean;
  origenes?: readonly string[];
  /** Para pruebas: la ventana propia y la del OS. */
  ventana?: Window;
  padre?: Window;
}

export class PuenteOS {
  private origen: string | null = null;
  private desfase: number | null = null;
  private retardoMin = Infinity;
  private comunOS = false;
  private estado: EstacionDelOS | null = null;
  private capacidades: string[] = [];
  private oyentes = new Set<(e: EstacionDelOS | null) => void>();
  private esperas = new Map<string, (m: Mensaje) => void>();
  private pendientes = new Map<string, number>();
  private latido: ReturnType<typeof setInterval> | null = null;
  private readonly yo: Window | undefined;
  private readonly padre: Window | undefined;
  private readonly alMensaje = (ev: MessageEvent) => this.recibir(ev);

  constructor(private readonly op: OpcionesPuente) {
    this.yo = op.ventana ?? (typeof window !== "undefined" ? window : undefined);
    this.padre = op.padre ?? (typeof window !== "undefined" ? window.parent : undefined);
  }

  /** Saluda al OS. False si nadie contesta en `esperaMs` (no estamos dentro del OS). */
  async conectar(esperaMs = 1500): Promise<boolean> {
    if (!this.yo || !this.padre || this.padre === this.yo) return false;
    this.yo.addEventListener("message", this.alMensaje);
    const r = await this.pedir("hola", { app: this.op.app, suena: !!this.op.suena }, "bienvenida", esperaMs);
    if (!r) {
      this.yo.removeEventListener("message", this.alMensaje);
      return false;
    }
    this.capacidades = Array.isArray(r.capacidades) ? r.capacidades.filter((x): x is string => typeof x === "string") : [];
    this.estado = (r.estacion as EstacionDelOS | null) ?? null;
    this.latido = setInterval(() => {
      this.mandar("latido", { suena: !!this.op.suena });
      this.medirReloj();
    }, 5000);
    for (let i = 0; i < 6; i++) setTimeout(() => this.medirReloj(), i * 120);
    return true;
  }

  desconectar(): void {
    this.yo?.removeEventListener("message", this.alMensaje);
    if (this.latido) clearInterval(this.latido);
    this.latido = null;
  }

  conectado(): boolean {
    return this.origen !== null;
  }

  /** Lo que el OS dijo que sabe hacer («crear», «sintonizar», «accion», «reloj»…). */
  capacidadesOS(): readonly string[] {
    return this.capacidades;
  }

  /** Hora común de la estación (ms). Sin medir aún, la del aparato. */
  ahoraComun(): number {
    return Date.now() + (this.desfase ?? 0);
  }

  /** Pasa un instante común a la hora local de este aparato. */
  aLocal(tComun: number): number {
    return tComun - (this.desfase ?? 0);
  }

  /** Error máximo del enlace con el OS (ms); null si el OS aún no tiene hora común. */
  precisionMs(): number | null {
    return this.comunOS && Number.isFinite(this.retardoMin) ? Math.round((this.retardoMin / 2) * 10) / 10 : null;
  }

  estadoActual(): EstacionDelOS | null {
    return this.estado;
  }

  alEstado(cb: (e: EstacionDelOS | null) => void): () => void {
    this.oyentes.add(cb);
    return () => {
      this.oyentes.delete(cb);
    };
  }

  async crear(d: {
    titulo: string;
    enlace: string;
    params?: ParametrosSesion;
    osciladores?: OsciladorApp[];
    volumen?: number;
    privada: boolean;
  }): Promise<CreadaPorOS> {
    const datos: Record<string, unknown> = { titulo: d.titulo, enlace: d.enlace, privada: d.privada };
    if (d.params) datos.params = d.params;
    if (d.osciladores) datos.osciladores = d.osciladores.slice(0, 16);
    if (typeof d.volumen === "number") datos.volumen = d.volumen;
    const r = await this.pedir("crear", datos, "creada", 15_000, true);
    if (!r) throw new Error(this.ultimoError ?? "StarSeed OS no contestó.");
    return { id: String(r.id), enlace: String(r.enlace), enlaceControl: String(r.enlaceControl), directorio: String(r.directorio) };
  }

  sintonizar(enlace: string): void {
    this.mandar("sintonizar", { enlace });
  }

  /** iniciar | pausar | reanudar | terminar | parametros (con params u osciladores) | volumen. */
  async accion(
    accion: string,
    extra: { params?: ParametrosSesion; osciladores?: OsciladorApp[]; volumen?: number } = {},
  ): Promise<{ ok: boolean; motivo?: string }> {
    const r = await this.pedir("accion", { accion, ...extra }, "resultado", 5000);
    return r ? { ok: r.ok === true, motivo: typeof r.motivo === "string" ? r.motivo : undefined } : { ok: false, motivo: "StarSeed OS no contestó." };
  }

  salir(): void {
    this.mandar("salir", {});
  }

  /* ─────────────── interno ─────────────── */

  private ultimoError: string | null = null;

  private permitidos(): readonly string[] {
    return this.op.origenes ?? ORIGENES_OS;
  }

  private mandar(tipo: string, datos: Record<string, unknown>): void {
    if (!this.padre) return;
    if (!this.origen && tipo !== "hola") return;
    try {
      this.padre.postMessage({ ss: "estacion", v: VERSION_PUENTE, tipo, ...datos }, this.origen ?? "*");
    } catch {
      /* el OS se fue */
    }
  }

  private pedir(tipo: string, datos: Record<string, unknown>, respuesta: string, ms: number, errorEsFallo = false): Promise<Mensaje | null> {
    return new Promise((ok) => {
      const fin = setTimeout(() => {
        this.esperas.delete(respuesta);
        ok(null);
      }, ms);
      this.esperas.set(respuesta, (m) => {
        clearTimeout(fin);
        ok(m);
      });
      this.esperas.set("error", (m) => {
        clearTimeout(fin);
        this.esperas.delete(respuesta);
        this.ultimoError = typeof m.motivo === "string" ? m.motivo : null;
        ok(errorEsFallo ? null : m);
      });
      this.mandar(tipo, datos);
    });
  }

  private medirReloj(): void {
    const id = Math.random().toString(36).slice(2, 12);
    this.pendientes.set(id, Date.now());
    if (this.pendientes.size > 32) this.pendientes.delete(this.pendientes.keys().next().value as string);
    this.mandar("reloj-ping", { id, t0: this.pendientes.get(id) });
  }

  private recibir(ev: MessageEvent): void {
    if (ev.source !== this.padre || !this.permitidos().includes(ev.origin)) return;
    const m = ev.data as Mensaje;
    if (!m || m.ss !== "estacion" || m.v !== VERSION_PUENTE || typeof m.tipo !== "string") return;
    const t3 = Date.now();
    this.origen = ev.origin;
    if (m.tipo === "reloj-pong" && typeof m.id === "string" && this.pendientes.has(m.id)) {
      const t0 = this.pendientes.get(m.id)!;
      this.pendientes.delete(m.id);
      this.comunOS = m.comun === true;
      const t1 = Number(m.t1);
      const t2 = Number(m.t2);
      const retardo = t3 - t0 - (t2 - t1);
      if (Number.isFinite(retardo) && retardo >= 0 && retardo <= this.retardoMin + 2) {
        this.retardoMin = Math.min(this.retardoMin, retardo);
        this.desfase = (t1 - t0 + (t2 - t3)) / 2;
      }
      return;
    }
    if (m.tipo === "estado") {
      this.estado = (m.estacion as EstacionDelOS | null) ?? null;
      for (const cb of Array.from(this.oyentes)) {
        try {
          cb(this.estado);
        } catch {
          /* nada */
        }
      }
    }
    const espera = this.esperas.get(m.tipo);
    if (espera) {
      this.esperas.delete(m.tipo);
      espera(m);
    }
  }
}

/** `puenteOS()`: conecta con el OS si la app está dentro de él. Null si no hay OS que conteste. */
export async function puenteOS(op: OpcionesPuente, esperaMs = 1500): Promise<PuenteOS | null> {
  if (!op.padre && !dentroDeUnMarco()) return null;
  const p = new PuenteOS(op);
  return (await p.conectar(esperaMs)) ? p : null;
}
