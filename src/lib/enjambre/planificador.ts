/**
 * planificador — qué trozo se pide a qué vía, y la super-siembra (ENJ1110A · 2026-11-10). Contrato: §7.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro y determinista: no tiene red ni reloj propios (el tiempo se pasa en cada llamada) y los desempates salen de
 * un hash de la semilla de la neurona, así que dos neuronas no piden lo mismo y una prueba se repite igual.
 *
 * VÍA = (par, carril) con capacidad medida, latencia, coste y fiabilidad. Una neurona con Bluetooth y red local
 * hacia el mismo par tiene dos vías. Ver `canal-multitrayecto-vias` y `matriz-enlaces` para de dónde salen.
 *
 * Asignación: para cada trozo, en el orden del modo, se calcula el instante estimado de llegada por cada vía que
 * puede darlo (cola ya comprometida + su tamaño / capacidad + latencia, corregido por fiabilidad y coste). Se
 * asigna a la de llegada más temprana; si esa vía no tiene hueco en su cola, el trozo ESPERA en lugar de irse a
 * una vía peor. Efecto: las vías rápidas llevan el grueso y las lentas (Bluetooth) solo reciben lo que ninguna
 * rápida puede dar (trozos raros) o lo que, de verdad, les sale a cuenta.
 *
 * Profundidad de cola por vía: producto ancho de banda × retardo en trozos (+1), entre 1 y 24; las vías lentas
 * (menos de una décima de la mejor, o < 1 Mb/s) nunca pasan de 2.
 *
 * Modos:
 *   raro-primero  los trozos con menos copias conocidas, primero (salud del enjambre)
 *   secuencial    ventana deslizante desde el cursor de reproducción; con `ritmoBps` los trozos cuyo plazo se acerca
 *                 ignoran el coste y pueden duplicarse; lo que sobra de la ventana se rellena como raro-primero
 *   urgente       contenido pequeño: por orden, a la vía más rápida sin mirar el coste
 *   final         partida final: lo que ya está pedido se pide también a otra vía/par (duplicados) y al llegar
 *                 uno se cancelan los demás; se activa solo cuando quedan pocos trozos en los otros modos
 * Castigos: trozo corrupto → golpe a la vía (vetada con espera creciente) y al par (vetado al llegar a `maxGolpesPar`).
 */

import { crearAzar, hashTexto32 } from "./util";

export type ModoPlan = "secuencial" | "raro-primero" | "final" | "urgente";
export const MODOS_PLAN: readonly ModoPlan[] = ["secuencial", "raro-primero", "final", "urgente"];

export interface ViaPlan {
  id: string;
  par: string;
  /** Nombre del carril («ble-gatt», «lan-tcp»…): solo informativo. */
  lana?: string;
  capacidadKbps: number | null;
  latenciaMs: number | null;
  /** 0 (gratis) .. 1 (datos medidos, batería justa…). */
  costo?: number;
  /** 0..1, por defecto 1. */
  fiabilidad?: number;
  /** El par es un espejo HTTP: tiene todo y no habla el protocolo. */
  espejo?: boolean;
}

export interface Peticion {
  rq: number;
  via: string;
  par: string;
  pieza: number;
  t0: number;
  dup: boolean;
  /** La vía estaba vacía al pedir: la muestra de velocidad es limpia. */
  limpia: boolean;
}

export interface OpcionesPlan {
  nPiezas: number;
  longitud: (i: number) => number;
  modo?: ModoPlan;
  /** Semilla de desempates (p. ej. hash del id de la neurona). */
  semilla?: number;
  ventana?: number;
  rellenar?: boolean;
  umbralFinal?: number;
  maxDuplicados?: number;
  maxPorLlamada?: number;
  vetoViaMs?: number;
  maxGolpesPar?: number;
  /** Bytes por segundo a los que se reproduce (modo secuencial con plazos). */
  ritmoBps?: number;
  kbpsPorDefecto?: number;
  /** El par NO puede dar este trozo ahora (p. ej. no hay capa y él no sabe dar pruebas). */
  bloqueo?: (par: string, pieza: number) => boolean;
}

export type MotivoFallo = "corrupto" | "no-tengo" | "ocupada" | "timeout" | "no-autorizado" | "sin-prueba" | "par-salio";

interface EstVia {
  v: ViaPlan;
  enVuelo: Set<number>;
  bytesPend: number;
  vetadaHasta: number;
  golpes: number;
  fallos: number;
  kbpsMedida: number | null;
}

interface EstPar {
  id: string;
  piezas: Set<number>;
  todo: boolean;
  negadas: Set<number>;
  golpes: number;
  vetado: boolean;
  sinPrueba: boolean;
  espejo: boolean;
}

const KBPS_DEFECTO = 1000;

export class Planificador {
  readonly n: number;
  private readonly op: Required<Omit<OpcionesPlan, "nPiezas" | "longitud" | "ritmoBps" | "bloqueo">> & { ritmoBps: number | null };
  private readonly bloqueo: ((par: string, pieza: number) => boolean) | null;
  private readonly longitud: (i: number) => number;
  private readonly tengo: Uint8Array;
  private nTengo = 0;
  private vias = new Map<string, EstVia>();
  private pares = new Map<string, EstPar>();
  private pets = new Map<number, Peticion>();
  private porPieza = new Map<number, Peticion[]>();
  private rqSig = 1;
  private cursor = 0;
  private cursorT = 0;
  private modoBase: ModoPlan;
  /** Bytes pedidos por vía (estadística). */
  readonly bytesPorVia = new Map<string, number>();

  constructor(o: OpcionesPlan) {
    this.n = o.nPiezas;
    this.longitud = o.longitud;
    this.bloqueo = o.bloqueo ?? null;
    this.tengo = new Uint8Array(o.nPiezas);
    this.modoBase = o.modo ?? "raro-primero";
    this.op = {
      modo: this.modoBase,
      semilla: o.semilla ?? 1,
      ventana: o.ventana ?? 8,
      rellenar: o.rellenar ?? true,
      umbralFinal: o.umbralFinal ?? Math.min(8, Math.max(2, Math.ceil(o.nPiezas * 0.02))),
      maxDuplicados: o.maxDuplicados ?? 2,
      maxPorLlamada: o.maxPorLlamada ?? 256,
      vetoViaMs: o.vetoViaMs ?? 4000,
      maxGolpesPar: o.maxGolpesPar ?? 3,
      ritmoBps: o.ritmoBps ?? null,
      kbpsPorDefecto: o.kbpsPorDefecto ?? KBPS_DEFECTO,
    };
  }

  /* ───────────── Estado ───────────── */

  get modo(): ModoPlan {
    return this.modoBase;
  }
  fijarModo(m: ModoPlan): void {
    this.modoBase = m;
  }
  /** Reproducción: el cursor (trozo que se está viendo/oyendo) y el instante en que estaba ahí. */
  reproduciendo(cursor: number, ahora: number): void {
    this.cursor = Math.max(0, Math.min(this.n - 1, cursor));
    this.cursorT = ahora;
  }
  marcarTengo(i: number): void {
    if (i >= 0 && i < this.n && !this.tengo[i]) {
      this.tengo[i] = 1;
      this.nTengo++;
    }
  }
  tiene(i: number): boolean {
    return this.tengo[i] === 1;
  }
  get completo(): boolean {
    return this.nTengo === this.n;
  }
  get faltan(): number {
    return this.n - this.nTengo;
  }
  enVuelo(): Peticion[] {
    return [...this.pets.values()];
  }

  private par(id: string, espejo = false): EstPar {
    let p = this.pares.get(id);
    if (!p) this.pares.set(id, (p = { id, piezas: new Set(), todo: false, negadas: new Set(), golpes: 0, vetado: false, sinPrueba: false, espejo }));
    return p;
  }

  agregarVia(v: ViaPlan): void {
    const prev = this.vias.get(v.id);
    if (prev) {
      prev.v = { ...prev.v, ...v };
      return;
    }
    this.vias.set(v.id, { v: { ...v }, enVuelo: new Set(), bytesPend: 0, vetadaHasta: 0, golpes: 0, fallos: 0, kbpsMedida: null });
    const p = this.par(v.par, v.espejo === true);
    if (v.espejo) p.todo = true;
  }

  actualizarVia(id: string, c: { capacidadKbps?: number | null; latenciaMs?: number | null; costo?: number; fiabilidad?: number }): void {
    const e = this.vias.get(id);
    if (e) e.v = { ...e.v, ...c };
  }

  /** Quita una vía; devuelve las peticiones que llevaba (hay que volver a pedir esos trozos). */
  quitarVia(id: string): Peticion[] {
    const e = this.vias.get(id);
    if (!e) return [];
    const perdidas: Peticion[] = [];
    for (const rq of [...e.enVuelo]) {
      const p = this.pets.get(rq);
      if (p) {
        this.soltar(p);
        perdidas.push(p);
      }
    }
    this.vias.delete(id);
    return perdidas;
  }

  /** Un par se fue: fuera sus vías y su inventario. */
  quitarPar(id: string): Peticion[] {
    const perdidas: Peticion[] = [];
    for (const [vid, e] of [...this.vias]) if (e.v.par === id) perdidas.push(...this.quitarVia(vid));
    this.pares.delete(id);
    return perdidas;
  }

  /** Lo que el par dice que tiene. `inc` suma; si no, sustituye. */
  disponibles(par: string, piezas: Iterable<number>, inc = false): void {
    const p = this.par(par);
    if (!inc) {
      p.piezas.clear();
      p.todo = false;
    }
    for (const i of piezas)
      if (Number.isInteger(i) && i >= 0 && i < this.n) {
        p.piezas.add(i);
        p.negadas.delete(i);
      }
  }

  peticion(rq: number): Peticion | null {
    return this.pets.get(rq) ?? null;
  }

  parCompleto(par: string): void {
    this.par(par).todo = true;
  }

  parSinPrueba(par: string): boolean {
    return this.pares.get(par)?.sinPrueba ?? false;
  }
  limpiarSinPrueba(): void {
    for (const p of this.pares.values()) p.sinPrueba = false;
  }

  golpesDe(par: string): number {
    return this.pares.get(par)?.golpes ?? 0;
  }
  parVetado(par: string): boolean {
    return this.pares.get(par)?.vetado ?? false;
  }
  viaVetadaHasta(via: string): number {
    return this.vias.get(via)?.vetadaHasta ?? 0;
  }
  golpesVia(via: string): number {
    return this.vias.get(via)?.golpes ?? 0;
  }
  kbpsDe(via: string): number {
    const e = this.vias.get(via);
    return e ? this.kbps(e) : 0;
  }

  /** Copias conocidas del trozo `i` entre pares no vetados. */
  copias(i: number): number {
    let c = 0;
    for (const p of this.pares.values()) if (this.tiene_(p, i)) c++;
    return c;
  }

  private tiene_(p: EstPar, i: number): boolean {
    return !p.vetado && !p.negadas.has(i) && (p.todo || p.piezas.has(i));
  }

  /* ───────────── Capacidad y profundidad ───────────── */

  private kbps(e: EstVia): number {
    return Math.max(8, e.kbpsMedida ?? e.v.capacidadKbps ?? this.op.kbpsPorDefecto);
  }

  private maxKbps(): number {
    let m = 0;
    for (const e of this.vias.values()) m = Math.max(m, this.kbps(e));
    return m;
  }

  private longMedia(): number {
    let t = 0;
    for (let i = 0; i < this.n; i++) t += this.longitud(i);
    return Math.max(1, t / Math.max(1, this.n));
  }

  esLenta(id: string): boolean {
    const e = this.vias.get(id);
    return !!e && this.kbps(e) < Math.max(1000, 0.1 * this.maxKbps());
  }

  profundidad(e: EstVia, modo: ModoPlan, longMedia: number): number {
    const bps = (this.kbps(e) * 1000) / 8;
    const rtt = (e.v.latenciaMs ?? 50) / 1000 + 0.02;
    let d = Math.ceil((bps * rtt) / longMedia) + 1;
    const lenta = this.kbps(e) < Math.max(1000, 0.1 * this.maxKbps());
    d = lenta ? Math.min(d, 2) : Math.max(d, 3);
    d = Math.max(1, Math.min(24, d));
    return modo === "urgente" ? d + 2 : d;
  }

  /** Segundos estimados hasta tener el trozo por esta vía, con lo que ya lleva en cola. */
  private eta(e: EstVia, bytes: number, ignorarCosto: boolean): number {
    const s = ((e.bytesPend + bytes) * 8) / (this.kbps(e) * 1000);
    let t = (e.v.latenciaMs ?? 50) / 1000 + s;
    t /= Math.max(0.2, Math.min(1, e.v.fiabilidad ?? 1));
    if (!ignorarCosto) t *= 1 + 2 * Math.max(0, Math.min(1, e.v.costo ?? 0));
    return t;
  }

  /* ───────────── Orden de trozos ───────────── */

  private clave(i: number): number {
    return hashTexto32(`${this.op.semilla}|${i}`);
  }

  private ordenRaro(piezas: number[]): number[] {
    const c = new Map<number, number>();
    for (const i of piezas) c.set(i, this.copias(i));
    return piezas.sort((a, b) => (c.get(a)! - c.get(b)!) || this.clave(a) - this.clave(b));
  }

  private plazoMs(i: number): number | null {
    const r = this.op.ritmoBps;
    if (!r) return null;
    let bytes = 0;
    for (let k = this.cursor; k < i; k++) bytes += this.longitud(k);
    return this.cursorT + (bytes * 1000) / r;
  }

  private finalActivo(modo: ModoPlan, sinPedir: number): boolean {
    if (modo === "final") return true;
    if (modo === "urgente") return false;
    return this.faltan <= this.op.umbralFinal && sinPedir === 0;
  }

  /* ───────────── Asignación ───────────── */

  /**
   * Peticiones nuevas para este instante. Cada una queda registrada como «en vuelo» hasta `recibido` o `fallida`.
   * Llamar de nuevo cuando llegue un trozo, cambie una vía o venza algo.
   */
  siguiente(ahora: number): Peticion[] {
    const modo = this.modoBase;
    const out: Peticion[] = [];
    const longMedia = this.longMedia();
    const prof = new Map<string, number>();
    for (const [id, e] of this.vias) prof.set(id, this.profundidad(e, modo, longMedia));

    const sinPedir: number[] = [];
    for (let i = 0; i < this.n; i++) if (!this.tengo[i] && !this.porPieza.has(i) && this.copias(i) > 0) sinPedir.push(i);
    let orden: number[];
    if (modo === "urgente") orden = sinPedir.sort((a, b) => a - b);
    else if (modo === "secuencial") {
      const ini = this.cursor;
      const ven = sinPedir.filter((i) => i >= ini && i < ini + this.op.ventana).sort((a, b) => a - b);
      const resto = this.op.rellenar ? this.ordenRaro(sinPedir.filter((i) => !(i >= ini && i < ini + this.op.ventana))) : [];
      orden = ven.concat(resto);
    } else orden = this.ordenRaro(sinPedir);

    const hacer = (i: number, dup: boolean): boolean => {
      const largo = this.longitud(i);
      const plazo = modo === "secuencial" ? this.plazoMs(i) : null;
      let mejor: EstVia | null = null;
      let mejorEta = Infinity;
      const critica = plazo !== null && plazo - ahora < 2000;
      const ignorarCosto = modo === "urgente" || critica;
      for (const e of this.vias.values()) {
        const p = this.pares.get(e.v.par);
        if (!p || !this.tiene_(p, i) || e.vetadaHasta > ahora) continue;
        if (this.bloqueo && this.bloqueo(p.id, i)) continue;
        if (dup && (this.porPieza.get(i) ?? []).some((q) => q.par === e.v.par)) continue;
        if (!dup && e.enVuelo.size > 0 && [...e.enVuelo].some((rq) => this.pets.get(rq)?.pieza === i)) continue;
        const t = this.eta(e, largo, ignorarCosto);
        if (t < mejorEta || (t === mejorEta && mejor && e.v.id < mejor.v.id)) {
          mejor = e;
          mejorEta = t;
        }
      }
      if (!mejor) return false;
      const libre = mejor.enVuelo.size < (prof.get(mejor.v.id) ?? 1) + (critica ? 1 : 0);
      if (!libre) return false;
      const pet: Peticion = { rq: this.rqSig++, via: mejor.v.id, par: mejor.v.par, pieza: i, t0: ahora, dup, limpia: mejor.enVuelo.size === 0 };
      this.pets.set(pet.rq, pet);
      mejor.enVuelo.add(pet.rq);
      mejor.bytesPend += largo;
      this.bytesPorVia.set(mejor.v.id, (this.bytesPorVia.get(mejor.v.id) ?? 0) + largo);
      const l = this.porPieza.get(i) ?? [];
      l.push(pet);
      this.porPieza.set(i, l);
      out.push(pet);
      return true;
    };

    for (const i of orden) {
      if (out.length >= this.op.maxPorLlamada) break;
      hacer(i, false);
    }

    if (this.finalActivo(modo, orden.length - out.length)) {
      const enCurso = [...this.porPieza.keys()].filter((i) => !this.tengo[i] && (this.porPieza.get(i)?.length ?? 0) < this.op.maxDuplicados);
      for (const i of enCurso.sort((a, b) => a - b)) {
        if (out.length >= this.op.maxPorLlamada) break;
        hacer(i, true);
      }
    }
    return out;
  }

  private soltar(p: Peticion): void {
    this.pets.delete(p.rq);
    const e = this.vias.get(p.via);
    if (e && e.enVuelo.delete(p.rq)) e.bytesPend = Math.max(0, e.bytesPend - this.longitud(p.pieza));
    const l = this.porPieza.get(p.pieza);
    if (l) {
      const r = l.filter((q) => q.rq !== p.rq);
      if (r.length) this.porPieza.set(p.pieza, r);
      else this.porPieza.delete(p.pieza);
    }
  }

  /** Llegó y se verificó: devuelve la petición y las duplicadas que hay que cancelar. */
  recibido(rq: number, ahora: number): { pet: Peticion; cancelar: Peticion[] } | null {
    const pet = this.pets.get(rq);
    if (!pet) return null;
    const e = this.vias.get(pet.via);
    const otras = (this.porPieza.get(pet.pieza) ?? []).filter((q) => q.rq !== rq);
    this.soltar(pet);
    for (const o of otras) this.soltar(o);
    this.marcarTengo(pet.pieza);
    if (e) {
      e.fallos = 0;
      if (pet.limpia) {
        const dt = Math.max(1, ahora - pet.t0 - (e.v.latenciaMs ?? 0));
        const muestra = (this.longitud(pet.pieza) * 8) / dt;
        e.kbpsMedida = e.kbpsMedida === null ? muestra : e.kbpsMedida * 0.7 + muestra * 0.3;
      }
    }
    return { pet, cancelar: otras };
  }

  /** La petición no llegó a buen puerto. El trozo vuelve a quedar pendiente (salvo que haya otra copia en vuelo). */
  fallida(rq: number, motivo: MotivoFallo, ahora: number): Peticion | null {
    const pet = this.pets.get(rq);
    if (!pet) return null;
    this.soltar(pet);
    const e = this.vias.get(pet.via);
    const p = this.pares.get(pet.par);
    switch (motivo) {
      case "corrupto":
        if (e) {
          e.golpes++;
          e.vetadaHasta = ahora + this.op.vetoViaMs * 2 ** Math.min(6, e.golpes - 1);
        }
        if (p) {
          p.golpes++;
          if (p.golpes >= this.op.maxGolpesPar) p.vetado = true;
        }
        break;
      case "no-tengo":
      case "no-autorizado":
        p?.negadas.add(pet.pieza);
        break;
      case "ocupada":
        if (e) e.vetadaHasta = ahora + 1500;
        break;
      case "sin-prueba":
        if (p) p.sinPrueba = true;
        break;
      case "timeout":
        if (e && ++e.fallos >= 3) e.vetadaHasta = ahora + this.op.vetoViaMs;
        break;
      case "par-salio":
        break;
    }
    return pet;
  }

  /** Peticiones que llevan demasiado tiempo (4 veces lo estimado, mínimo 4 s). */
  vencidas(ahora: number): Peticion[] {
    const out: Peticion[] = [];
    for (const p of this.pets.values()) {
      const e = this.vias.get(p.via);
      const est = e ? this.eta(e, this.longitud(p.pieza), true) * 1000 : 1000;
      if (ahora - p.t0 > Math.max(4000, est * 4)) out.push(p);
    }
    return out;
  }

  estadoVias(): Array<{ id: string; par: string; kbps: number; enVuelo: number; vetadaHasta: number; golpes: number; lenta: boolean }> {
    return [...this.vias.values()].map((e) => ({ id: e.v.id, par: e.v.par, kbps: this.kbps(e), enVuelo: e.enVuelo.size, vetadaHasta: e.vetadaHasta, golpes: e.golpes, lenta: this.esLenta(e.v.id) }));
  }
}

/* ═════════════════════════════ Super-siembra (BEP 16, a la StarSeed) ═════════════════════════════ */

export interface OpcionesSuper {
  /** Trozos que se ofrecen a cada par al conectar. Por defecto 2. */
  ofertaInicial?: number;
  /** Trozos ofrecidos sin confirmar que se han repartido, como máximo por par. Por defecto 3. */
  maxPendientes?: number;
  /** Si un par lleva tanto sin que se confirme nada, se le suelta más (ms). Por defecto 8000. */
  esperaMs?: number;
  semilla?: number;
  /** Cuántas recolectoras se esperan (envío a grupo). Con 1 o menos, un único par recibe todo. Por defecto 1. */
  paresEsperados?: number;
}

/**
 * Cuando UNA sembradora alimenta a MUCHAS recolectoras (un envío a grupo), enseña a cada una solo unos pocos
 * trozos que nadie tiene aún y no ofrece más hasta ver que lo ofrecido aparece en OTRA recolectora. Así el origen
 * sube casi una sola copia del contenido y el resto lo reparten ellas entre sí. Con menos de dos pares conectados
 * no hay a quién repartir y se ofrece todo.
 */
export class SuperSembrador {
  private ofrecidas = new Map<string, Set<number>>();
  private pendientes = new Map<string, Set<number>>();
  private ultima = new Map<string, number>();
  private primero = new Map<number, string>();
  private tienen = new Map<number, Set<string>>();
  private sinOfrecer: number[];
  private readonly cfg: Required<OpcionesSuper>;

  constructor(
    private readonly n: number,
    o: OpcionesSuper = {},
  ) {
    this.cfg = { ofertaInicial: o.ofertaInicial ?? 2, maxPendientes: o.maxPendientes ?? 3, esperaMs: o.esperaMs ?? 8000, semilla: o.semilla ?? 7, paresEsperados: o.paresEsperados ?? 1 };
    const azar = crearAzar(this.cfg.semilla);
    const v = Array.from({ length: n }, (_, i) => i);
    for (let i = v.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [v[i], v[j]] = [v[j], v[i]];
    }
    this.sinOfrecer = v;
  }

  get pares(): number {
    return this.ofrecidas.size;
  }

  private ofrecer(par: string, cuantos: number, ahora: number): number[] {
    const of = this.ofrecidas.get(par)!;
    const pe = this.pendientes.get(par)!;
    const nuevas: number[] = [];
    while (nuevas.length < cuantos) {
      let i = -1;
      while (this.sinOfrecer.length) {
        const c = this.sinOfrecer.pop()!;
        if (!of.has(c)) {
          i = c;
          break;
        }
      }
      if (i < 0) {
        // Todo se ha ofrecido ya a alguien: lo menos repartido que este par aún no tenga.
        let mejor = -1;
        let mc = Infinity;
        for (let k = 0; k < this.n; k++) {
          if (of.has(k) || this.tienen.get(k)?.has(par)) continue;
          const c = this.tienen.get(k)?.size ?? 0;
          if (c < mc) {
            mc = c;
            mejor = k;
          }
        }
        i = mejor;
      }
      if (i < 0) break;
      of.add(i);
      pe.add(i);
      if (!this.primero.has(i)) this.primero.set(i, par);
      nuevas.push(i);
    }
    if (nuevas.length) this.ultima.set(par, ahora);
    return nuevas;
  }

  /** Un par se conecta: devuelve los trozos que se le enseñan. */
  alConectar(par: string, ahora: number): number[] {
    if (!this.ofrecidas.has(par)) {
      this.ofrecidas.set(par, new Set());
      this.pendientes.set(par, new Set());
    }
    if (this.soloUno()) return this.ofrecerTodo(par, ahora);
    return this.ofrecer(par, this.cfg.ofertaInicial, ahora);
  }

  /** Sin nadie más a quien repartir, no tiene sentido retener nada. */
  private soloUno(): boolean {
    return this.cfg.paresEsperados <= 1 && this.ofrecidas.size < 2;
  }

  private ofrecerTodo(par: string, ahora: number): number[] {
    return this.ofrecer(par, this.n, ahora);
  }

  /**
   * Un par dice que tiene trozos. Devuelve, por par, las ofertas nuevas (porque lo que ya se le ofreció se ha
   * confirmado repartido, o porque ya no queda nadie más: entonces se le suelta todo).
   */
  alTengo(par: string, piezas: Iterable<number>, ahora: number): Map<string, number[]> {
    for (const i of piezas) {
      let s = this.tienen.get(i);
      if (!s) this.tienen.set(i, (s = new Set()));
      s.add(par);
      const origen = this.primero.get(i);
      if (origen && origen !== par) this.pendientes.get(origen)?.delete(i);
    }
    return this.recalcular(ahora);
  }

  private recalcular(ahora: number): Map<string, number[]> {
    const out = new Map<string, number[]>();
    for (const [par, pe] of this.pendientes) {
      const huecos = this.cfg.maxPendientes - pe.size;
      const nuevas = this.soloUno() ? this.ofrecerTodo(par, ahora) : huecos > 0 ? this.ofrecer(par, huecos, ahora) : [];
      if (nuevas.length) out.set(par, nuevas);
    }
    return out;
  }

  /** Para pares que no avanzan (los demás aún no han recibido nada): se da por repartido lo más antiguo. */
  alTick(ahora: number): Map<string, number[]> {
    for (const [par, pe] of this.pendientes) {
      if (pe.size >= this.cfg.maxPendientes && ahora - (this.ultima.get(par) ?? 0) >= this.cfg.esperaMs) {
        const primero = pe.values().next().value as number | undefined;
        if (primero !== undefined) pe.delete(primero);
        this.ultima.set(par, ahora);
      }
    }
    return this.recalcular(ahora);
  }

  /** ¿Puedo servirle este trozo a este par? Solo los que se le han ofrecido. */
  ofrecida(par: string, i: number): boolean {
    return this.ofrecidas.get(par)?.has(i) ?? false;
  }

  quitar(par: string): Map<string, number[]> {
    this.ofrecidas.delete(par);
    this.pendientes.delete(par);
    this.ultima.delete(par);
    return this.recalcular(0);
  }
}
