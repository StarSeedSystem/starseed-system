/**
 * motor-estacion — el sonido de una estación de Omnifrecuencias, generado EN LOCAL y programado
 * al instante exacto del reloj común (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§5).
 *
 * Mismo grafo que la app de Omnifrecuencias (`frecuencias/hooks/useAudio.ts`): por oscilador, dos
 * ondas mezclables → paneo 3D (PannerNode, escala 10, z invertida) → volumen; pulsos isocrónicos
 * con un LFO cuadrado; transiciones de ida y vuelta. La diferencia es CUÁNDO: aquí cada tramo
 * sonoro se programa con `start(t)` y rampas en el tiempo del AudioContext que corresponde a su
 * instante en el reloj común, y cada oscilador arranca en el cruce por cero que le toca
 * (`inicioEnFase`), así que quien llega tarde suena en fase con los demás.
 *
 * Cómo se programa: cada 200 ms se miran los próximos 1,5 s de la línea de tiempo
 * (`tramosEntre`, puro) y se reconcilian con lo ya programado. Un tramo es un trozo de la línea
 * en el que suena la misma entonación con el mismo ancla. Nada toca el audio hasta que la persona
 * pulsa (las reglas de reproducción automática de los navegadores lo exigen).
 */

import {
  inicioEnFase,
  ordenarLinea,
  posicionEn,
  valoresOscilador,
  type EntonacionParam,
  type EstadoSesion,
  type OsciladorParam,
} from "./transmision-parametrica";

/* ═══════════════════════ Puro: tramos y tiempos ═══════════════════════ */

export interface Tramo {
  /** Clave estable: ancla + parámetros. */
  clave: string;
  /** Instante común en que empieza a sonar (puede ser pasado). */
  desde: number;
  /** Instante común en que deja de sonar (Infinity si nada lo para aún). */
  hasta: number;
  ancla: number;
  entonacion: EntonacionParam;
}

/** Pasa un instante común al tiempo del AudioContext (segundos). */
export function aTiempoContexto(tComun: number, ahoraComun: number, ctxAhoraS: number): number {
  return ctxAhoraS + (tComun - ahoraComun) / 1000;
}

/**
 * Tramos que suenan en [desde, hasta] según la línea. Solo Omnifrecuencias suena: Audiomorphic
 * no lleva audio propio.
 */
export function tramosEntre(estado: EstadoSesion, desde: number, hasta: number): Tramo[] {
  const cortes = [desde, ...ordenarLinea(estado.linea).map((a) => a.t).filter((t) => t > desde && t <= hasta)];
  const tramos: Tramo[] = [];
  for (let i = 0; i < cortes.length; i++) {
    const t = cortes[i];
    const p = posicionEn(estado, t);
    if (p.fase !== "sonando" || p.ancla === null || p.params.tipo !== "omnifrecuencias") continue;
    const clave = `${Math.round(p.ancla * 1000)}|${JSON.stringify(p.params.entonacion.osciladores)}`;
    const fin = i + 1 < cortes.length ? cortes[i + 1] : Infinity;
    const previo = tramos[tramos.length - 1];
    if (previo && previo.clave === clave && previo.hasta === t) {
      previo.hasta = fin; // un cambio de volumen no corta el tramo
      continue;
    }
    // Lo que pase más allá de la ventana se verá en la siguiente vuelta (cada 200 ms).
    tramos.push({ clave, desde: t, hasta: fin, ancla: p.ancla, entonacion: p.params.entonacion });
  }
  return tramos;
}

export interface MapeoContexto {
  /** Instante común → tiempo del AudioContext en que hay que programar para que SALGA por el altavoz en ese instante. */
  aCtx: (tComun: number) => number;
  /** Latencia de salida que se compensa (ms), según el navegador. */
  latenciaMs: number;
  /** "salida": con `getOutputTimestamp` (lo más fino); "contexto": con `currentTime` y la latencia declarada. */
  base: "salida" | "contexto";
}

/**
 * Cómo pasar del reloj común al del AudioContext compensando la latencia de salida.
 * Con `getOutputTimestamp()` el navegador dice qué muestra está sonando en el altavoz en qué
 * instante de `performance.now()`: programando con eso, el sonido SALE en el instante común (no
 * solo se calcula). Sin él, `currentTime` menos `outputLatency + baseLatency`.
 */
export function crearMapeoContexto(op: {
  ahoraComun: number;
  perfAhora: number;
  ctxActual: number;
  marca?: { contextTime?: number; performanceTime?: number } | null;
  latenciaDeclaradaS?: number;
}): MapeoContexto {
  const m = op.marca;
  if (m && typeof m.contextTime === "number" && typeof m.performanceTime === "number" && m.performanceTime > 0) {
    const ct = m.contextTime;
    const pt = m.performanceTime;
    return {
      aCtx: (t) => ct + (op.perfAhora + (t - op.ahoraComun) - pt) / 1000,
      latenciaMs: Math.max(0, (op.ctxActual - ct) * 1000 - (op.perfAhora - pt)),
      base: "salida",
    };
  }
  const lat = Math.max(0, op.latenciaDeclaradaS ?? 0);
  return { aCtx: (t) => aTiempoContexto(t, op.ahoraComun, op.ctxActual) - lat, latenciaMs: lat * 1000, base: "contexto" };
}

/** Volumen de la sesión en el instante `t` (las acciones de volumen cuentan desde su instante). */
export function volumenEn(estado: EstadoSesion, t: number): number {
  return posicionEn(estado, t).volumen;
}

/* ═══════════════════════ Audio (solo en el navegador) ═══════════════════════ */

const ESCALA_ESPACIAL = 10;
const MIRA_MS = 1500;
const PASO_MS = 200;
const FUNDIDO_S = 0.02;

type VentanaAudio = Window & { webkitAudioContext?: typeof AudioContext };

interface NodosOscilador {
  o: OsciladorParam;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  g1: GainNode;
  g2: GainNode;
  vol: GainNode;
  panner: PannerNode;
  lfo?: OscillatorNode;
  lfoGain?: GainNode;
}

interface TramoVivo {
  tramo: Tramo;
  vca: GainNode;
  nodos: NodosOscilador[];
  /** Hasta dónde están programadas las rampas de las transiciones (instante común). */
  rampasHasta: number;
  /** Fin programado (instante común) para no reprogramarlo sin motivo. */
  finProgramado: number;
}

export interface EstadoMotor {
  listo: boolean;
  /** Latencia de salida compensada (ms) y de dónde sale; null antes de abrir el audio. */
  latenciaMs: number | null;
  baseTiempo: "salida" | "contexto" | null;
  /** El navegador tiene el audio parado hasta que la persona pulse. */
  necesitaGesto: boolean;
  sonando: boolean;
  tramos: number;
  error: string | null;
}

export class MotorSonido {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private vivos: TramoVivo[] = [];
  private volLocal = 0.8;
  private silencioLocal = false;
  private h: ReturnType<typeof setInterval> | null = null;
  private error: string | null = null;
  private mapeo: MapeoContexto | null = null;
  private fuente: (() => { estado: EstadoSesion; ahora: number } | null) | null = null;

  /** Crea el AudioContext. Llamar SOLO desde un gesto de la persona (pulsar un botón). */
  async preparar(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as VentanaAudio).webkitAudioContext;
        if (!Ctor) {
          this.error = "Este navegador no tiene Web Audio.";
          return false;
        }
        const ctx = new Ctor({ latencyHint: "interactive" });
        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        const l = ctx.listener;
        if (l.positionX) {
          l.positionX.value = 0;
          l.positionY.value = 0;
          l.positionZ.value = 0;
        }
        this.ctx = ctx;
        this.master = master;
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.error = null;
      return this.ctx.state === "running";
    } catch (e) {
      this.error = e instanceof Error ? e.message : "No se pudo abrir el audio.";
      return false;
    }
  }

  /** Engancha la fuente de verdad (estado de la sesión + hora común) y empieza a programar. */
  seguir(fuente: () => { estado: EstadoSesion; ahora: number } | null): void {
    this.fuente = fuente;
    if (this.h === null && typeof setInterval !== "undefined") {
      this.h = setInterval(() => this.programar(), PASO_MS);
    }
    this.programar();
  }

  estado(): EstadoMotor {
    return {
      listo: !!this.ctx,
      latenciaMs: this.mapeo ? Math.round(this.mapeo.latenciaMs * 10) / 10 : null,
      baseTiempo: this.mapeo?.base ?? null,
      necesitaGesto: !this.ctx || this.ctx.state !== "running",
      sonando: this.vivos.length > 0 && !this.silencioLocal,
      tramos: this.vivos.length,
      error: this.error,
    };
  }

  volumen(v: number): void {
    this.volLocal = Math.max(0, Math.min(1, v));
    this.programar();
  }

  /** Silencio SOLO aquí (los demás siguen oyendo). */
  silenciar(si: boolean): void {
    this.silencioLocal = si;
    this.programar();
  }

  volumenLocal(): number {
    return this.volLocal;
  }

  silenciado(): boolean {
    return this.silencioLocal;
  }

  /** Para todo y suelta el audio. */
  cerrar(): void {
    if (this.h !== null) clearInterval(this.h);
    this.h = null;
    this.fuente = null;
    for (const v of this.vivos) this.soltar(v, 0);
    this.vivos = [];
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
  }

  /** Reconciliación: lo que DEBE sonar en la ventana frente a lo que ya está programado. */
  programar(): void {
    const ctx = this.ctx;
    const master = this.master;
    const f = this.fuente?.();
    if (!ctx || !master || !f || ctx.state !== "running") return;
    const ahora = f.ahora;
    const ahoraCtx = ctx.currentTime;
    let marca: AudioTimestamp | null = null;
    try {
      marca = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
    } catch {
      marca = null;
    }
    const mapeo = crearMapeoContexto({
      ahoraComun: ahora,
      perfAhora: typeof performance !== "undefined" ? performance.now() : 0,
      ctxActual: ahoraCtx,
      marca,
      latenciaDeclaradaS: (ctx.outputLatency || 0) + (ctx.baseLatency || 0),
    });
    this.mapeo = mapeo;
    const aCtx = mapeo.aCtx;
    // Margen para construir el grafo y que el inicio no caiga en el pasado del altavoz.
    const margenMs = 40 + mapeo.latenciaMs;

    // Volumen general: el de la sesión × el local, con las acciones de volumen a su instante.
    const volObjetivo = this.silencioLocal ? 0 : volumenEn(f.estado, ahora) * this.volLocal;
    master.gain.cancelScheduledValues(ahoraCtx);
    master.gain.setTargetAtTime(volObjetivo, ahoraCtx, 0.03);
    for (const a of f.estado.linea) {
      if (a.tipo === "volumen" && a.t > ahora && a.t <= ahora + MIRA_MS && !this.silencioLocal) {
        master.gain.setValueAtTime(volumenEn(f.estado, a.t) * this.volLocal, aCtx(a.t));
      }
    }

    const tramos = tramosEntre(f.estado, ahora, ahora + MIRA_MS);
    const claves = new Set(tramos.map((t) => t.clave));

    // 1) Lo que ya no debe sonar: fuera con un fundido corto, ya.
    for (const v of this.vivos.filter((x) => !claves.has(x.tramo.clave))) this.soltar(v, ahoraCtx);
    this.vivos = this.vivos.filter((x) => claves.has(x.tramo.clave));

    // 2) Tramos nuevos o con fin cambiado.
    for (const t of tramos) {
      let v = this.vivos.find((x) => x.tramo.clave === t.clave);
      if (!v) {
        const inicio = Math.max(t.desde, ahora + margenMs);
        v = this.construir(ctx, master, t, inicio, aCtx);
        this.vivos.push(v);
      }
      v.tramo = t;
      if (v.finProgramado !== t.hasta) {
        // El fin cambió (llegó una pausa, o se anuló): se rehace el final del tramo.
        v.vca.gain.cancelScheduledValues(ahoraCtx);
        v.vca.gain.setValueAtTime(1, ahoraCtx);
        if (Number.isFinite(t.hasta)) {
          const fin = Math.max(aCtx(t.hasta), ahoraCtx + FUNDIDO_S);
          v.vca.gain.setValueAtTime(1, Math.max(ahoraCtx, fin - FUNDIDO_S));
          v.vca.gain.linearRampToValueAtTime(0, fin);
        }
        v.finProgramado = t.hasta;
      }
      this.rampas(v, ahora + MIRA_MS, aCtx);
    }

    // 3) Limpieza de tramos cuyo fin ya pasó.
    for (const v of this.vivos.filter((x) => Number.isFinite(x.finProgramado) && x.finProgramado < ahora - 200)) {
      this.soltar(v, ahoraCtx);
    }
    this.vivos = this.vivos.filter((x) => !(Number.isFinite(x.finProgramado) && x.finProgramado < ahora - 200));
  }

  private construir(
    ctx: AudioContext,
    master: GainNode,
    t: Tramo,
    inicioComun: number,
    aCtx: (t: number) => number,
  ): TramoVivo {
    const vca = ctx.createGain();
    vca.gain.value = 1;
    vca.connect(master);
    const posS = (inicioComun - t.ancla) / 1000;
    const nodos: NodosOscilador[] = [];
    for (const o of t.entonacion.osciladores) {
      const val = valoresOscilador(o, posS);
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = val.onda;
      osc2.type = val.onda2 ?? val.onda;
      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      const vol = ctx.createGain();
      const panner = ctx.createPanner();
      const inicioCtx = aCtx(inicioEnFase(t.ancla, inicioComun, o.trans ? 0 : val.f));
      osc1.frequency.setValueAtTime(val.f, inicioCtx);
      osc2.frequency.setValueAtTime(val.f, inicioCtx);
      g1.gain.setValueAtTime(1 - val.mezcla, inicioCtx);
      g2.gain.setValueAtTime(val.mezcla, inicioCtx);
      vol.gain.setValueAtTime(val.vol, inicioCtx);
      if (panner.positionX) {
        panner.positionX.setValueAtTime(val.x * ESCALA_ESPACIAL, inicioCtx);
        panner.positionY.setValueAtTime(val.y * ESCALA_ESPACIAL, inicioCtx);
        panner.positionZ.setValueAtTime(val.z * -ESCALA_ESPACIAL, inicioCtx);
      } else {
        panner.setPosition(val.x * ESCALA_ESPACIAL, val.y * ESCALA_ESPACIAL, val.z * -ESCALA_ESPACIAL);
      }
      osc1.connect(g1).connect(vol);
      osc2.connect(g2).connect(vol);
      let lfo: OscillatorNode | undefined;
      let lfoGain: GainNode | undefined;
      if (o.pulso && o.pulso > 0) {
        // Pulsos isocrónicos: el volumen oscila entre 0 y el valor base, en fase con el ancla.
        const pulsado = ctx.createGain();
        pulsado.gain.value = 0.5;
        lfo = ctx.createOscillator();
        lfo.type = "square";
        lfo.frequency.value = o.pulso;
        lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain).connect(pulsado.gain);
        vol.connect(pulsado).connect(panner);
        lfo.start(aCtx(inicioEnFase(t.ancla, inicioComun, o.pulso)));
      } else {
        vol.connect(panner);
      }
      panner.connect(vca);
      osc1.start(inicioCtx);
      osc2.start(inicioCtx);
      nodos.push({ o, osc1, osc2, g1, g2, vol, panner, lfo, lfoGain });
    }
    return { tramo: t, vca, nodos, rampasHasta: inicioComun, finProgramado: Infinity };
  }

  /** Programa las transiciones hasta `hasta` con rampas lineales de 250 ms (exactas en sus extremos). */
  private rampas(v: TramoVivo, hasta: number, aCtx: (t: number) => number): void {
    const conTransicion = v.nodos.filter((n) => n.o.trans);
    if (!conTransicion.length) {
      v.rampasHasta = hasta;
      return;
    }
    const fin = Math.min(hasta, v.tramo.hasta);
    for (let t = v.rampasHasta + 250; t <= fin; t += 250) {
      const posS = (t - v.tramo.ancla) / 1000;
      const ct = aCtx(t);
      for (const n of conTransicion) {
        const val = valoresOscilador(n.o, posS);
        n.osc1.frequency.linearRampToValueAtTime(val.f, ct);
        n.osc2.frequency.linearRampToValueAtTime(val.f, ct);
        n.vol.gain.linearRampToValueAtTime(val.vol, ct);
        n.g1.gain.linearRampToValueAtTime(1 - val.mezcla, ct);
        n.g2.gain.linearRampToValueAtTime(val.mezcla, ct);
        if (n.panner.positionX) {
          n.panner.positionX.linearRampToValueAtTime(val.x * ESCALA_ESPACIAL, ct);
          n.panner.positionY.linearRampToValueAtTime(val.y * ESCALA_ESPACIAL, ct);
          n.panner.positionZ.linearRampToValueAtTime(val.z * -ESCALA_ESPACIAL, ct);
        }
      }
      v.rampasHasta = t;
    }
  }

  private soltar(v: TramoVivo, ahoraCtx: number): void {
    try {
      if (ahoraCtx > 0) {
        v.vca.gain.cancelScheduledValues(ahoraCtx);
        v.vca.gain.setValueAtTime(v.vca.gain.value, ahoraCtx);
        v.vca.gain.linearRampToValueAtTime(0, ahoraCtx + FUNDIDO_S);
      }
    } catch {
      /* nada */
    }
    const parar = ahoraCtx + FUNDIDO_S + 0.02;
    for (const n of v.nodos) {
      for (const o of [n.osc1, n.osc2, n.lfo]) {
        try {
          o?.stop(parar);
        } catch {
          /* ya parado */
        }
      }
    }
    setTimeout(() => {
      try {
        v.vca.disconnect();
      } catch {
        /* nada */
      }
    }, 200);
  }
}
