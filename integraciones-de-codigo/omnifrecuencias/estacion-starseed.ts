/**
 * estacion-starseed — para el repo de Omnifrecuencias (StarSeedSystem/generador_frecuencias).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Copiar tal cual a `src/lib/estacion-starseed.ts` del repo de la app (ver INSTRUCCIONES.md).
 * Sin dependencias. Habla el protocolo `postMessage` v1 de StarSeed OS
 * (`src/lib/estaciones/puente-omnifrecuencias.ts` en el repo del OS).
 *
 *   · Dentro de StarSeed OS (la app abierta en su marco): crea la estación, la sigue y la controla
 *     por el OS, que es quien está conectado a la red, firma y mide el reloj común.
 *   · Fuera del OS (web suelta o app nativa): `enlaceParaAbrirFuera()` abre «Nueva estación» del OS
 *     con la entonación ya puesta.
 *
 * El reloj común llega por el mismo puente (NTP sobre postMessage): `ahoraComun()` es la hora de
 * la estación y `aTiempoAudio()` la pasa al reloj de un AudioContext para programar el sonido
 * en el instante exacto, si la app prefiere sonar ella (y entonces avisa con `suena: true` para
 * que el OS no suene doble).
 */

export const VERSION_PUENTE = 1;

/** Orígenes de StarSeed OS a los que se habla (añade el tuyo si lo despliegas en otro sitio). */
export const ORIGENES_OS = ["https://starseed-os.vercel.app", "http://localhost:9002", "http://localhost:3000"];

/** Lo mismo que `OscillatorState` de la app (solo lo que viaja). */
export interface OsciladorApp {
  id?: string;
  frequency: number;
  type: "sine" | "square" | "sawtooth" | "triangle";
  volume: number;
  panX: number;
  panY: number;
  panZ: number;
  name?: string;
  type2?: "sine" | "square" | "sawtooth" | "triangle";
  typeMix?: number;
  transition?: unknown;
}

export interface EstadoEstacion {
  id: string;
  titulo: string;
  fuente: "omnifrecuencias" | "audiomorphic";
  enlaceEntonacion: string;
  privada: boolean;
  fase: "esperando" | "sonando" | "pausada" | "terminada";
  /** Instante común en que la reproducción valdría 0 (mientras suena). */
  ancla: number | null;
  posicionMs: number;
  params: unknown;
  volumen: number;
  control: boolean;
  reloj: { modo: string; precisionMs: number | null; cotaMs: number | null };
  conectados: number | null;
  ahoraComun: number;
}

export interface Creada {
  id: string;
  enlace: string;
  enlaceControl: string;
  directorio: string;
}

type Mensaje = { ss: "estacion"; v: number; tipo: string; [k: string]: unknown };

export function dentroDeStarSeed(): boolean {
  try {
    return typeof window !== "undefined" && window.parent !== window;
  } catch {
    return true; // un marco de otro origen lanza al mirar: estamos dentro de algo
  }
}

/** Desfase NTP de una muestra (lo mismo que hace el OS). */
export function muestra(t0: number, t1: number, t2: number, t3: number): { desfase: number; retardo: number } {
  return { desfase: (t1 - t0 + (t2 - t3)) / 2, retardo: t3 - t0 - (t2 - t1) };
}

/** Enlace para abrir «Nueva estación» del OS desde FUERA (otra pestaña o la app nativa). */
export function enlaceParaAbrirFuera(
  os: string,
  datos: { titulo: string; enlace: string; osciladores: OsciladorApp[] },
): string {
  const json = JSON.stringify(datos.osciladores.slice(0, 16));
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const frag = new URLSearchParams({ p: b64, t: datos.titulo.slice(0, 100), e: datos.enlace.slice(0, 500) });
  return `${os.replace(/\/$/, "")}/estaciones?nueva=omnifrecuencias#${frag.toString()}`;
}

export class EstacionStarSeed {
  private origen: string | null = null;
  private desfase: number | null = null;
  private retardoMin = Infinity;
  /** El OS tiene hora COMÚN de una estación (si no, solo su hora local). */
  private comunOS = false;
  private estado: EstadoEstacion | null = null;
  private oyentes = new Set<(e: EstadoEstacion | null) => void>();
  private esperas = new Map<string, (m: Mensaje) => void>();
  private pendientes = new Map<string, number>();
  private latido: ReturnType<typeof setInterval> | null = null;
  private readonly alMensaje = (ev: MessageEvent) => this.recibir(ev);

  constructor(private readonly op: { suena?: boolean; origenes?: string[] } = {}) {}

  /** Saluda al OS. Devuelve false si no hay OS que conteste en 1,5 s (no estamos dentro). */
  async conectar(): Promise<boolean> {
    if (!dentroDeStarSeed()) return false;
    window.addEventListener("message", this.alMensaje);
    const r = await this.pedir("hola", { app: "omnifrecuencias", suena: !!this.op.suena }, "bienvenida", 1500);
    if (!r) return false;
    this.estado = (r.estacion as EstadoEstacion | null) ?? null;
    this.latido = setInterval(() => {
      this.mandar("latido", { suena: !!this.op.suena });
      this.medirReloj();
    }, 5000);
    for (let i = 0; i < 6; i++) setTimeout(() => this.medirReloj(), i * 120);
    return true;
  }

  desconectar(): void {
    window.removeEventListener("message", this.alMensaje);
    if (this.latido) clearInterval(this.latido);
    this.latido = null;
  }

  /** Hora de la estación (ms). Sin medir aún, la del aparato (y `precisionMs()` es null). */
  ahoraComun(): number {
    return Date.now() + (this.desfase ?? 0);
  }

  /** Error máximo del enlace con el OS (ms). Null si el OS aún no tiene hora común de una estación. */
  precisionMs(): number | null {
    return this.comunOS && Number.isFinite(this.retardoMin) ? this.retardoMin / 2 : null;
  }

  /** Instante común → tiempo de un AudioContext (para `osc.start(t)`). */
  aTiempoAudio(ctx: { currentTime: number }, tComun: number): number {
    return ctx.currentTime + (tComun - this.ahoraComun()) / 1000;
  }

  estadoActual(): EstadoEstacion | null {
    return this.estado;
  }

  alEstado(cb: (e: EstadoEstacion | null) => void): () => void {
    this.oyentes.add(cb);
    return () => this.oyentes.delete(cb);
  }

  /** Crea la estación con la entonación actual («Transmitir en directo»). */
  async crear(d: { titulo: string; enlace: string; osciladores: OsciladorApp[]; volumen: number; privada: boolean }): Promise<Creada> {
    const r = await this.pedir("crear", { ...d, osciladores: d.osciladores.slice(0, 16) }, "creada", 15_000);
    if (!r) throw new Error("StarSeed OS no contestó.");
    return { id: String(r.id), enlace: String(r.enlace), enlaceControl: String(r.enlaceControl), directorio: String(r.directorio) };
  }

  sintonizar(enlace: string): void {
    this.mandar("sintonizar", { enlace });
  }

  /** iniciar | pausar | reanudar | terminar | parametros (con osciladores) | volumen (con volumen). */
  async accion(accion: string, extra: { osciladores?: OsciladorApp[]; volumen?: number } = {}): Promise<{ ok: boolean; motivo?: string }> {
    const r = await this.pedir("accion", { accion, ...extra }, "resultado", 5000);
    return r ? { ok: r.ok === true, motivo: typeof r.motivo === "string" ? r.motivo : undefined } : { ok: false, motivo: "StarSeed OS no contestó." };
  }

  salir(): void {
    this.mandar("salir", {});
  }

  /* ─────────────── interno ─────────────── */

  private permitidos(): string[] {
    return this.op.origenes ?? ORIGENES_OS;
  }

  private mandar(tipo: string, datos: Record<string, unknown>): void {
    // Hasta que el OS contesta al saludo no se sabe su origen: solo el saludo sale sin destino fijo
    // (no lleva nada privado). Todo lo demás va SOLO al origen verificado.
    if (!this.origen && tipo !== "hola") return;
    window.parent.postMessage({ ss: "estacion", v: VERSION_PUENTE, tipo, ...datos }, this.origen ?? "*");
  }

  private pedir(tipo: string, datos: Record<string, unknown>, respuesta: string, ms: number): Promise<Mensaje | null> {
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
        ok(tipo === "crear" ? null : m);
      });
      this.mandar(tipo, datos);
    });
  }

  private medirReloj(): void {
    const id = Math.random().toString(36).slice(2, 12);
    const t0 = Date.now();
    this.pendientes.set(id, t0);
    this.mandar("reloj-ping", { id, t0 });
  }

  private recibir(ev: MessageEvent): void {
    if (ev.source !== window.parent || !this.permitidos().includes(ev.origin)) return;
    const m = ev.data as Mensaje;
    if (!m || m.ss !== "estacion" || m.v !== VERSION_PUENTE) return;
    const t3 = Date.now();
    this.origen = ev.origin;
    if (m.tipo === "reloj-pong" && typeof m.id === "string" && this.pendientes.has(m.id)) {
      const t0 = this.pendientes.get(m.id)!;
      this.pendientes.delete(m.id);
      this.comunOS = m.comun === true;
      const s = muestra(t0, Number(m.t1), Number(m.t2), t3);
      // Por postMessage el retardo es de microsegundos: nos quedamos con la mejor muestra.
      if (s.retardo >= 0 && s.retardo <= this.retardoMin + 2) {
        this.retardoMin = Math.min(this.retardoMin, s.retardo);
        this.desfase = s.desfase;
      }
      return;
    }
    if (m.tipo === "estado") {
      this.estado = (m.estacion as EstadoEstacion | null) ?? null;
      for (const cb of this.oyentes) cb(this.estado);
    }
    const espera = this.esperas.get(m.tipo);
    if (espera) {
      this.esperas.delete(m.tipo);
      espera(m);
    }
  }
}
