/**
 * sesion — una estación en vivo conectada: canales, firmas, reloj común y línea de tiempo.
 * Copia fiel de `src/lib/estaciones/sesion-en-vivo.ts` del OS (mismo sobre, mismas firmas, mismo
 * reloj): una app con este kit y StarSeed OS están en la MISMA sesión, en los dos sentidos.
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§4).
 *
 * Une las tres piezas puras —modelo (`transmision-parametrica.ts`), reloj (`reloj-comun.ts`) y
 * firmas (`cripto-estacion.ts`)— con uno o varios CANALES por los que viajan los mensajes:
 * Supabase Realtime (internet) y enlaces locales emparejados sin internet (P2P). La app oficial
 * dentro del OS no es un canal: habla con el OS por `puente-omnifrecuencias.ts`. Un canal es solo
 * «manda un texto / avísame cuando llegue uno»: este módulo no sabe de redes, por eso se prueba
 * entero con canales en memoria.
 *
 * Papeles:
 *   · CONTROL: quien tiene la llave privada (el anfitrión, en cualquiera de sus medios). Firma
 *     acciones, estados y respuestas del reloj.
 *   · REFERENCIA: UN medio del anfitrión (el que creó la sesión) cuyo reloj es el común. Los demás
 *     medios con control se sincronizan con él y solo contestan la hora si no lo oyen (30 s).
 *   · OYENTE: verifica todo lo firmado; descarta lo que no lo esté (y lo cuenta en `descartados`).
 *
 * Sobre de cada mensaje: `{"t":"est","s":id,"e":evento,"d":json | "x":cifrado,"f":firma}`. La firma
 * cubre `s\ne\n(d|x)`. En las privadas la carga va cifrada con la clave del token (AES-GCM).
 * Las acciones se programan `margenMs` en el futuro (600 ms) para que lleguen a todos antes de
 * su instante: así empiezan a la vez en todos los medios.
 */

import {
  cifrar,
  descifrar,
  firmar,
  llaveCasaConId,
  verificar,
} from "./cripto";
import { programarSondeo, RelojComun, type EstadoReloj, type PingReloj, type PongReloj } from "./reloj";
import {
  aplicarAccion,
  fusionarEstados,
  leerEstado,
  numeroAccion,
  posicionEn,
  sanearAccion,
  sanearParametros,
  serializarEstado,
  type AccionLinea,
  type EstadoSesion,
  type FichaSesion,
  type ParametrosSesion,
  type PosicionSesion,
  type TipoAccion,
} from "./modelo";

export type TipoCanal = "internet" | "local";

export interface CanalEstacion {
  tipo: TipoCanal;
  etiqueta: string;
  enviar(texto: string): void;
  alRecibir(cb: (texto: string) => void): () => void;
  abierto(): boolean;
  /** Otros conectados a este canal (presencia), si el canal lo sabe. */
  oyentes?(): number | null;
  /** Avisa cuando el canal queda abierto (p. ej. al suscribirse a Realtime). */
  alAbrir?(cb: () => void): () => void;
  cerrar(): void;
}

type Evento = "estado" | "accion" | "pedir" | "ping" | "pong";
const FIRMADOS: ReadonlySet<Evento> = new Set(["estado", "accion", "pong"]);

interface Sobre {
  t: "est";
  s: string;
  e: Evento;
  d?: string;
  x?: string;
  f?: string;
}

export interface FotoSesion {
  ficha: FichaSesion;
  estado: EstadoSesion;
  posicion: PosicionSesion;
  reloj: EstadoReloj;
  control: boolean;
  referencia: boolean;
  canales: { tipo: TipoCanal; etiqueta: string; abierto: boolean }[];
  oyentes: number | null;
  /** Hora local del último mensaje firmado por el anfitrión (null: aún nadie lo ha oído). */
  anfitrionVisto: number | null;
  /** Mensajes descartados por firma o datos no válidos. */
  descartados: number;
}

export interface OpcionesSesion {
  ficha: FichaSesion;
  token?: string | null;
  /** Llave privada: con ella este medio CONTROLA la sesión. */
  llave?: CryptoKey | null;
  /** Este medio es el reloj de referencia (solo el que creó la sesión). */
  referencia?: boolean;
  canales?: CanalEstacion[];
  reloj?: RelojComun;
  estadoInicial?: EstadoSesion | null;
  margenMs?: number;
  /** Cada cuánto el control repite el estado (latido de la sesión). */
  latidoMs?: number;
  /**
   * Las respuestas de hora se agrupan en lotes de este tiempo (ms): con 30 oyentes preguntando, un
   * mensaje en vez de 30. No resta precisión: lo que tarda la referencia en contestar (t2 − t1) se
   * descuenta en la fórmula. 0 = contestar al momento.
   */
  lotePongMs?: number;
  sondeo?: Parameters<typeof programarSondeo>[1];
  poner?: typeof setTimeout;
  quitar?: typeof clearTimeout;
}

const ESPERA_REFERENCIA_MS = 30_000;

export class SesionEnVivo {
  readonly ficha: FichaSesion;
  readonly reloj: RelojComun;
  private estado: EstadoSesion;
  private readonly token: string | null;
  private llave: CryptoKey | null;
  private referencia: boolean;
  private canales: CanalEstacion[] = [];
  private bajas = new Map<CanalEstacion, () => void>();
  private oyentesCb = new Set<(f: FotoSesion) => void>();
  private paradas: (() => void)[] = [];
  private anfitrionVisto: number | null = null;
  private referenciaVista: number | null = null;
  private descartados = 0;
  private ultimoEstadoEnviado = new Map<CanalEstacion, number>();
  private pedidos = 0;
  private readonly margenMs: number;
  private readonly latidoMs: number;
  private readonly lotePongMs: number;
  private lotes = new Map<CanalEstacion, { pings: { p: PingReloj; t1: number }[]; h: ReturnType<typeof setTimeout> | null }>();
  private readonly poner: typeof setTimeout;
  private readonly quitar: typeof clearTimeout;
  private readonly opSondeo: OpcionesSesion["sondeo"];
  private arrancada = false;
  private cerrada = false;

  constructor(op: OpcionesSesion) {
    this.ficha = op.ficha;
    this.token = op.token ?? null;
    this.llave = op.llave ?? null;
    this.referencia = !!op.referencia && !!op.llave;
    this.reloj = op.reloj ?? new RelojComun({ esReferencia: this.referencia });
    if (this.referencia) this.reloj.hacerReferencia(true);
    this.estado = op.estadoInicial && op.estadoInicial.ficha.id === op.ficha.id
      ? op.estadoInicial
      : { ficha: op.ficha, linea: [], rev: 0 };
    this.margenMs = op.margenMs ?? 600;
    this.latidoMs = op.latidoMs ?? 30_000;
    this.lotePongMs = op.lotePongMs ?? 200;
    // Ligados a globalThis: guardado en un campo, `this.poner(fn, ms)` llamaría a `setTimeout` con
    // `this` = la sesión y el navegador lanza «Illegal invocation» (medido el 2026-10-10 en
    // Omnifrecuencias: la estación se creaba pero el panel no arrancaba). En Node no falla; el OS
    // lo arregló igual en `sesion-en-vivo.ts` (OPD1010). Prueba: `__tests__/kit.test.ts`.
    this.poner = op.poner ?? (globalThis.setTimeout.bind(globalThis) as typeof setTimeout);
    this.quitar = op.quitar ?? (globalThis.clearTimeout.bind(globalThis) as typeof clearTimeout);
    this.opSondeo = { poner: this.poner, quitar: this.quitar, ...(op.sondeo ?? {}) };
    for (const c of op.canales ?? []) this.agregarCanal(c);
    this.paradas.push(this.reloj.suscribir(() => this.emitir()));
  }

  /* ─────────────── ciclo de vida ─────────────── */

  arrancar(): void {
    if (this.arrancada || this.cerrada) return;
    this.arrancada = true;
    // Comprobación de identidad: la llave pública de la ficha tiene que dar su id.
    void llaveCasaConId(this.ficha.pk, this.ficha.id).then((ok) => {
      if (!ok) {
        this.descartados++;
        this.cerrar();
      }
    });
    if (!this.referencia) {
      this.paradas.push(programarSondeo(() => this.preguntarHora(), this.opSondeo));
    }
    if (!this.llave) this.pedirEstado();
    const latir = () => {
      if (this.cerrada) return;
      if (this.llave) void this.difundirEstado();
      else if (this.anfitrionVisto === null && this.pedidos < 6) this.pedirEstado();
      h = this.poner(latir, this.llave ? this.latidoMs : 5_000);
    };
    let h = this.poner(latir, this.llave ? 500 : 5_000);
    this.paradas.push(() => this.quitar(h));
  }

  cerrar(): void {
    if (this.cerrada) return;
    this.cerrada = true;
    for (const l of this.lotes.values()) if (l.h) this.quitar(l.h);
    this.lotes.clear();
    for (const p of this.paradas.splice(0)) {
      try {
        p();
      } catch {
        /* nada */
      }
    }
    for (const c of [...this.canales]) this.quitarCanal(c, true);
    this.emitir();
  }

  agregarCanal(c: CanalEstacion): void {
    if (this.canales.includes(c) || this.cerrada) return;
    this.canales.push(c);
    const bajaRecibir = c.alRecibir((texto) => void this.recibir(texto, c));
    const bajaAbrir = c.alAbrir?.(() => this.alAbrirCanal(c));
    this.bajas.set(c, () => {
      bajaRecibir();
      bajaAbrir?.();
    });
    if (this.arrancada && safe(() => c.abierto(), false)) this.alAbrirCanal(c);
    this.emitir();
  }

  /** Un canal recién abierto: el anfitrión le manda el estado; el oyente lo pide y mide la hora. */
  private alAbrirCanal(c: CanalEstacion): void {
    if (!this.arrancada || this.cerrada || !this.canales.includes(c)) return;
    if (this.llave) void this.difundirEstado(c);
    else this.pedirEstado(c);
    if (this.referencia) return;
    // Ráfaga corta por ESTE canal: las preguntas del arranque pudieron salir antes de abrirse.
    for (let i = 0; i < 6; i++) {
      const h = this.poner(() => {
        if (this.cerrada || !safe(() => c.abierto(), false)) return;
        this.mandarPing(c);
      }, i * 150);
      this.paradas.push(() => this.quitar(h));
    }
    this.emitir();
  }

  quitarCanal(c: CanalEstacion, cerrarlo = false): void {
    this.bajas.get(c)?.();
    this.bajas.delete(c);
    this.canales = this.canales.filter((x) => x !== c);
    if (cerrarlo) {
      try {
        c.cerrar();
      } catch {
        /* nada */
      }
    }
    this.emitir();
  }

  /** Da el control a este medio (enlace de control importado). */
  tomarControl(llave: CryptoKey): void {
    this.llave = llave;
    this.emitir();
  }

  /* ─────────────── lectura ─────────────── */

  ahora(): number {
    return this.reloj.ahora();
  }

  foto(): FotoSesion {
    const oy = this.canales.map((c) => c.oyentes?.() ?? null).filter((n): n is number => typeof n === "number");
    return {
      ficha: this.ficha,
      estado: this.estado,
      posicion: posicionEn(this.estado, this.reloj.ahora()),
      reloj: this.reloj.estado(),
      control: !!this.llave,
      referencia: this.referencia,
      canales: this.canales.map((c) => ({ tipo: c.tipo, etiqueta: c.etiqueta, abierto: safe(() => c.abierto(), false) })),
      oyentes: oy.length ? oy.reduce((a, b) => a + b, 0) : null,
      anfitrionVisto: this.llave ? this.reloj.horaLocal() : this.anfitrionVisto,
      descartados: this.descartados,
    };
  }

  suscribir(cb: (f: FotoSesion) => void): () => void {
    this.oyentesCb.add(cb);
    return () => {
      this.oyentesCb.delete(cb);
    };
  }

  /* ─────────────── control ─────────────── */

  /**
   * Programa una acción para todos. Solo con control. Por defecto ocurre `margenMs` después de
   * ahora en el reloj común, para que llegue a todos antes de su instante.
   */
  async accion(
    tipo: Exclude<TipoAccion, "base">,
    extra: { params?: ParametrosSesion; volumen?: number; enMs?: number } = {},
  ): Promise<{ ok: boolean; accion?: AccionLinea; motivo?: string }> {
    if (!this.llave) return { ok: false, motivo: "Solo quien emite la estación puede cambiarla para todos." };
    if (this.reloj.estado().modo === "sin-referencia") {
      return { ok: false, motivo: "Todavía no hay hora común con la referencia: espera a que se sincronice." };
    }
    const t = this.reloj.ahora() + Math.max(0, extra.enMs ?? this.margenMs);
    const bruto: Record<string, unknown> = { n: numeroAccion(t), t, tipo };
    if (tipo === "parametros") {
      const p = sanearParametros(extra.params, this.ficha.fuente);
      if (!p) return { ok: false, motivo: "Parámetros no válidos para esta estación." };
      bruto.params = p;
    }
    if (tipo === "volumen") bruto.volumen = extra.volumen;
    const a = sanearAccion(bruto, this.ficha.fuente);
    if (!a) return { ok: false, motivo: "Acción no válida." };
    this.estado = aplicarAccion(this.estado, a);
    this.emitir();
    await this.mandar("accion", JSON.stringify(a));
    return { ok: true, accion: a };
  }

  /** Mide la hora ahora mismo (una pregunta por canal), además del sondeo periódico. */
  sondearAhora(): void {
    this.preguntarHora();
  }

  /** Pide el estado al anfitrión (lo hace sola al arrancar). */
  pedirEstado(solo?: CanalEstacion): void {
    this.pedidos++;
    void this.mandar("pedir", "{}", solo);
  }

  /* ─────────────── envío ─────────────── */

  private async sobre(e: Evento, d: string): Promise<string | null> {
    const s: Sobre = { t: "est", s: this.ficha.id, e };
    let carga = d;
    if (this.ficha.privada) {
      if (!this.token) return null; // una privada sin token no puede hablar
      carga = await cifrar(this.ficha.id, this.token, d);
      s.x = carga;
    } else {
      s.d = d;
    }
    if (FIRMADOS.has(e)) {
      if (!this.llave) return null;
      s.f = await firmar(this.llave, `${s.s}\n${e}\n${carga}`);
    }
    return JSON.stringify(s);
  }

  private async mandar(e: Evento, d: string, solo?: CanalEstacion): Promise<void> {
    const texto = await this.sobre(e, d);
    if (!texto) return;
    for (const c of solo ? [solo] : this.canales) {
      try {
        if (c.abierto()) c.enviar(texto);
      } catch {
        /* un canal caído no frena a los demás */
      }
    }
  }

  private async difundirEstado(solo?: CanalEstacion): Promise<void> {
    if (!this.llave) return;
    const ahora = this.reloj.horaLocal();
    const destinos = (solo ? [solo] : this.canales).filter((c) => ahora - (this.ultimoEstadoEnviado.get(c) ?? 0) >= 1000);
    if (!destinos.length) return;
    for (const c of destinos) this.ultimoEstadoEnviado.set(c, ahora);
    const texto = await this.sobre("estado", serializarEstado(this.estado));
    if (!texto) return;
    for (const c of destinos) {
      try {
        if (c.abierto()) c.enviar(texto);
      } catch {
        /* nada */
      }
    }
  }

  private preguntarHora(): void {
    if (this.cerrada) return;
    for (const c of this.canales) {
      if (!safe(() => c.abierto(), false)) continue;
      this.mandarPing(c);
    }
  }

  /**
   * Una pregunta de hora. En las públicas sale en el MISMO instante en que se anota t0 (sin pasar
   * por promesas): cualquier espera entre anotar y enviar sería un error asimétrico. En las privadas
   * hay que cifrar antes (≈ 0,1 ms de sesgo, dentro de la precisión que se enseña).
   */
  private mandarPing(c: CanalEstacion): void {
    if (this.ficha.privada) {
      void this.mandar("ping", JSON.stringify(this.reloj.nuevoPing()), c);
      return;
    }
    const p = this.reloj.nuevoPing();
    const sobre: Sobre = { t: "est", s: this.ficha.id, e: "ping", d: JSON.stringify(p) };
    try {
      c.enviar(JSON.stringify(sobre));
    } catch {
      /* canal caído */
    }
  }

  /* ─────────────── recepción ─────────────── */

  private async recibir(texto: string, canal: CanalEstacion): Promise<void> {
    const llegada = this.reloj.horaLocal(); // ANTES de cualquier trabajo: es t1 o t3
    if (this.cerrada || typeof texto !== "string" || texto.length > 40_000) return;
    let s: Sobre;
    try {
      s = JSON.parse(texto) as Sobre;
    } catch {
      return;
    }
    if (!s || s.t !== "est" || s.s !== this.ficha.id) return;
    const carga = this.ficha.privada ? s.x : s.d;
    if (typeof carga !== "string") return;
    if (FIRMADOS.has(s.e)) {
      if (typeof s.f !== "string" || !(await verificar(this.ficha.pk, `${s.s}\n${s.e}\n${carga}`, s.f))) {
        this.descartados++;
        this.emitir();
        return;
      }
    }
    let d = carga;
    if (this.ficha.privada) {
      if (!this.token) return;
      const claro = await descifrar(this.ficha.id, this.token, carga);
      if (claro === null) {
        this.descartados++;
        return;
      }
      d = claro;
    }
    let datos: unknown;
    try {
      datos = JSON.parse(d);
    } catch {
      return;
    }
    switch (s.e) {
      case "ping":
        await this.atenderPing(datos as PingReloj, llegada, canal);
        break;
      case "pong": {
        // Un lote `{ l: [...] }` o una respuesta suelta.
        const bruto = datos as { l?: unknown } | PongReloj;
        const lista = (Array.isArray((bruto as { l?: unknown }).l) ? ((bruto as { l: unknown[] }).l.slice(0, 64)) : [bruto]) as PongReloj[];
        this.anfitrionVisto = llegada;
        for (const p of lista) {
          if (!p || typeof p !== "object") continue;
          if (p.estrato === 0) this.referenciaVista = llegada;
          if (typeof p.id === "string" && p.para === this.reloj.id) this.reloj.recibirPong(p, llegada);
        }
        break;
      }
      case "estado": {
        const e = leerEstado(d);
        if (!e || e.ficha.id !== this.ficha.id || e.ficha.pk !== this.ficha.pk) {
          this.descartados++;
          break;
        }
        this.anfitrionVisto = llegada;
        this.estado = fusionarEstados(this.estado, { ...e, ficha: this.estado.ficha });
        this.emitir();
        break;
      }
      case "accion": {
        const a = sanearAccion(datos, this.ficha.fuente);
        if (!a) {
          this.descartados++;
          break;
        }
        this.anfitrionVisto = llegada;
        this.estado = aplicarAccion(this.estado, a);
        this.emitir();
        break;
      }
      case "pedir":
        if (this.llave) await this.difundirEstado(canal);
        break;
    }
  }

  private async atenderPing(p: PingReloj, llegada: number, canal: CanalEstacion): Promise<void> {
    if (!this.llave || !p || typeof p.id !== "string" || typeof p.de !== "string" || !Number.isFinite(p.t0)) return;
    if (p.de === this.reloj.id) return;
    // Un medio con control que no es la referencia solo contesta si la referencia calla.
    if (!this.referencia) {
      const vista = this.referenciaVista;
      if (vista !== null && this.reloj.horaLocal() - vista < ESPERA_REFERENCIA_MS) return;
    }
    const limpio: PingReloj = { id: p.id.slice(0, 40), de: p.de.slice(0, 40), t0: p.t0 };
    if (this.lotePongMs <= 0) {
      const pong = this.reloj.atenderPing(limpio, llegada);
      if (pong) await this.mandar("pong", JSON.stringify({ l: [pong] }), canal);
      return;
    }
    let lote = this.lotes.get(canal);
    if (!lote) {
      lote = { pings: [], h: null };
      this.lotes.set(canal, lote);
    }
    if (lote.pings.length >= 64) return;
    lote.pings.push({ p: limpio, t1: llegada });
    if (!lote.h) lote.h = this.poner(() => void this.vaciarLote(canal), this.lotePongMs);
  }

  /** Contesta todas las preguntas del lote en UN mensaje; t2 es el mismo para todas (el de ahora). */
  private async vaciarLote(canal: CanalEstacion): Promise<void> {
    const lote = this.lotes.get(canal);
    this.lotes.delete(canal);
    if (!lote || this.cerrada) return;
    const l = lote.pings.map((x) => this.reloj.atenderPing(x.p, x.t1)).filter((x): x is PongReloj => !!x);
    if (l.length) await this.mandar("pong", JSON.stringify({ l }), canal);
  }

  private emitir(): void {
    if (!this.oyentesCb.size) return;
    const f = this.foto();
    for (const cb of Array.from(this.oyentesCb)) {
      try {
        cb(f);
      } catch {
        /* nada */
      }
    }
  }
}

function safe<T>(fn: () => T, porDefecto: T): T {
  try {
    return fn();
  } catch {
    return porDefecto;
  }
}
