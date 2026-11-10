/**
 * enjambre — la sesión de un contenido en el enjambre (ENJ1110A · 2026-11-10). Contrato: §5–§8.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Une árbol, almacén, planificador, política, protocolo y espejos sobre un TRANSPORTE inyectado
 * (`TransporteEnj.enviar`). ENJ1110B enchufa aquí `transporte-universal` y las vías de `matriz-enlaces`; este
 * archivo no importa nada de la app, así que se prueba en memoria con una red simulada.
 *
 * Una sesión es una neurona dentro de UN enjambre (un contenido). Hace de recolectora mientras le falten trozos y de
 * sembradora con los que tiene (a la vez, como en BitTorrent). Reglas que no se saltan:
 *  · Nada entra al almacén sin verificarse: con la capa de piezas, comparando el hash; sin ella, con la prueba Merkle
 *    que viaja con el trozo. Un trozo malo es un golpe a la vía y al par y se vuelve a pedir a otro.
 *  · Todo lo que llega se valida (`leerMensajeEnj`); lo que no vale se ignora y cuenta como falta de protocolo.
 *  · Se sirve solo lo que la política permite, y en super-siembra solo lo que se ha «ofrecido» al par.
 *  · Sin reloj ni temporizadores propios: `tick()` lo llama quien integra (cada ~500 ms); todo el tiempo sale de `reloj()`.
 */

import {
  arbolDeBytes,
  cerosHasta,
  hashPar,
  hashPieza,
  longitudPieza,
  nodosEnNivel,
  pruebaDeNodo,
  rangoConPrueba,
  verificarCapa,
  verificarPrueba,
  verificarRango,
  BYTES_HASH,
  type Geometria,
} from "./arbol";
import type { AlmacenTrozos } from "./almacen";
import { AlmacenCanales, type RegistroCanal } from "./canal";
import type { VerificarBytes } from "./firmas";
import { ContadorDia, EquidadGrupo, decidirServir, AJUSTES_ENJAMBRE_POR_DEFECTO, type AjustesEnjambre, type CapacidadNeurona, type Relacion } from "./politica";
import { Planificador, SuperSembrador, type ModoPlan, type OpcionesSuper, type Peticion, type ViaPlan } from "./planificador";
import { escribirMensajeEnj, idNeuronaValido, leerMensajeEnj, type MensajeEnj, type MsgAnuncio, type MsgCapa, type MsgNo, type MsgPide, type MsgTengo, type MsgTrozo } from "./protocolo";
import { abrirTodo, idEnjambre, type ClaveSellado } from "./sellado-contenido";
import { geometriaDeSemilla, verificarSemilla, type Semilla } from "./semilla";
import type { FuenteEspejo } from "./espejo";
import { aHex, deHex, hashTexto32, igualesBytes } from "./util";

export interface TransporteEnj {
  /** Manda un mensaje al par por la vía indicada (null = la mejor que haya). No espera respuesta. */
  enviar(par: string, via: string | null, msg: Record<string, unknown>): void;
}

export interface ViaInfo {
  id: string;
  lana?: string;
  capacidadKbps: number | null;
  latenciaMs: number | null;
  costo?: number;
  fiabilidad?: number;
}

export interface OpcionesSesion {
  idPropio: string;
  semilla: Semilla;
  almacen: AlmacenTrozos;
  transporte: TransporteEnj;
  reloj: () => number;
  /** Secreto del enjambre (ámbitos no públicos). */
  secreto?: Uint8Array | null;
  /** Clave de contenido, si esta neurona es miembro y quiere poder leerlo. Un relé ciego NO la tiene. */
  clave?: ClaveSellado | null;
  ajustes?: AjustesEnjambre;
  capacidad?: () => CapacidadNeurona;
  relacionDe?: (par: string) => Relacion;
  modo?: ModoPlan;
  ventana?: number;
  ritmoBps?: number;
  superSiembra?: boolean | OpcionesSuper;
  verificar?: VerificarBytes;
  canales?: AlmacenCanales;
  espejos?: FuenteEspejo[];
  alDescubrirPar?: (neurona: string) => void;
  registro?: (linea: string) => void;
  kbpsPropios?: number;
}

interface InfoPar {
  id: string;
  vias: ViaInfo[];
  rol: string | null;
  completo: boolean;
  capa: boolean;
  recibioPares: Set<string>;
  ventanaT: number;
  ventanaN: number;
  faltas: number;
}

export interface ResumenSesion {
  id: string;
  piezas: number;
  total: number;
  completo: boolean;
  bytesBajados: number;
  bytesSubidos: number;
  porFuente: Record<string, number>;
  golpes: Record<string, number>;
  vias: Array<{ id: string; par: string; kbps: number; enVuelo: number; lenta: boolean }>;
}

const CUANTAS_CAPA = 256;
const MAX_MENSAJES_SEGUNDO = 400;

export class SesionEnjambre {
  readonly id: string;
  readonly g: Geometria;
  readonly plan: Planificador;
  semilla: Semilla;
  readonly raizBytes: Uint8Array;
  /** Hash verificado de cada trozo (la capa de piezas), o null si aún no se conoce. */
  private capa: Array<Uint8Array | null>;
  private nCapa = 0;
  private capaCompleta = false;
  private arriba: Uint8Array[][] | null = null;
  private pares = new Map<string, InfoPar>();
  private capasPedidas = new Map<number, { par: string; desde: number; t0: number }>();
  private rqCapa = 1;
  private sup: SuperSembrador | null = null;
  private tareas = new Set<Promise<unknown>>();
  private porAnunciar: number[] = [];
  private espejosActivos = false;
  private espejoCapaPedida = false;
  private cerrada = false;
  private pausa: string | null = null;
  private resolverCompleto: (() => void) | null = null;
  readonly alCompletar: Promise<void>;
  private completo_ = false;
  private subiendo = 0;
  private ultimoPex = 0;

  bytesBajados = 0;
  bytesSubidos = 0;
  readonly porFuente = new Map<string, number>();
  readonly dia = new ContadorDia();
  readonly eq: EquidadGrupo;
  readonly ajustes: AjustesEnjambre;
  readonly canales: AlmacenCanales | null;

  private constructor(
    private readonly o: OpcionesSesion,
    id: string,
    g: Geometria,
  ) {
    this.id = id;
    this.g = g;
    this.semilla = o.semilla;
    this.raizBytes = deHex(o.semilla.raiz)!;
    this.capa = new Array<Uint8Array | null>(g.nPiezas).fill(null);
    this.ajustes = o.ajustes ?? AJUSTES_ENJAMBRE_POR_DEFECTO;
    this.eq = new EquidadGrupo(this.ajustes.ratioSuave);
    this.canales = o.canales ?? null;
    this.alCompletar = new Promise<void>((r) => (this.resolverCompleto = r));
    this.plan = new Planificador({
      nPiezas: g.nPiezas,
      longitud: (i) => longitudPieza(g, i),
      modo: o.modo,
      semilla: hashTexto32(o.idPropio),
      ventana: o.ventana,
      ritmoBps: o.ritmoBps,
      bloqueo: (par, i) => !this.capa[i] && !(this.pares.get(par)?.capa ?? false) && !par.startsWith("espejo:"),
    });
  }

  /** Crea la sesión: calcula el id, registra el contenido, carga lo que ya hay y la capa guardada. Null si la semilla no vale. */
  static async crear(o: OpcionesSesion): Promise<SesionEnjambre | null> {
    const g = geometriaDeSemilla(o.semilla);
    if (!g) return null;
    const id = await idEnjambre(o.semilla.raiz, o.secreto);
    const s = new SesionEnjambre(o, id, g);
    const ok = await o.almacen.registrar({ raiz: o.semilla.raiz, ambito: o.semilla.ambito, tamano: o.semilla.tamano, tamanoPieza: o.semilla.tamanoPieza });
    if (!ok) return null;
    await o.almacen.retener(o.semilla.raiz);
    if (g.nPiezas === 1) {
      s.capa[0] = s.raizBytes;
      s.nCapa = 1;
      s.capaCompleta = true;
    } else {
      const guardada = await o.almacen.leerCapa(o.semilla.raiz);
      if (guardada && guardada.length === g.nPiezas * BYTES_HASH) {
        const hs: Uint8Array[] = [];
        for (let i = 0; i < g.nPiezas; i++) hs.push(guardada.slice(i * BYTES_HASH, (i + 1) * BYTES_HASH));
        if (await verificarCapa(g, hs, s.raizBytes)) {
          s.capa = hs;
          s.nCapa = g.nPiezas;
          s.capaCompleta = true;
        }
      }
    }
    for (const i of await o.almacen.piezas(o.semilla.raiz)) s.plan.marcarTengo(i);
    if (s.plan.completo) {
      if (!s.capaCompleta) await s.recalcularCapaDesdeAlmacen();
      s.marcarCompleto();
    }
    if (o.superSiembra && s.plan.completo && s.capaCompleta) s.sup = new SuperSembrador(g.nPiezas, typeof o.superSiembra === "object" ? o.superSiembra : {});
    s.log(`sesión ${id.slice(0, 8)} ${s.plan.completo ? "completa" : "recolectando"} ${g.nPiezas} trozos de ${g.tamanoPieza} B`);
    return s;
  }

  /* ───────────── Utilidades internas ───────────── */

  private log(l: string): void {
    this.o.registro?.(`enjambre: ${l}`);
  }

  private rastrear<T>(p: Promise<T>): Promise<T> {
    this.tareas.add(p);
    const quitar = () => this.tareas.delete(p);
    p.then(quitar, quitar);
    return p;
  }

  /** Espera a que no quede trabajo asíncrono propio en curso (para pruebas deterministas). */
  async reposo(): Promise<void> {
    while (this.tareas.size) await Promise.allSettled([...this.tareas]);
  }

  private enviar(par: string, via: string | null, m: MensajeEnj): void {
    try {
      this.o.transporte.enviar(par, via, escribirMensajeEnj(m));
    } catch {
      /* el transporte nunca debería lanzar; si lo hace, el timeout se encarga */
    }
  }

  private mejorVia(par: string): string | null {
    const p = this.pares.get(par);
    if (!p || !p.vias.length) return null;
    return p.vias.slice().sort((a, b) => (a.latenciaMs ?? 1e9) - (b.latenciaMs ?? 1e9) || (a.id < b.id ? -1 : 1))[0].id;
  }

  private rolPropio(): "sembradora" | "recolectora" | "relevo" {
    if (!this.o.clave && this.semilla.ambito !== "publico") return this.completo_ ? "relevo" : "recolectora";
    return this.completo_ ? "sembradora" : "recolectora";
  }

  private esRelevoCiego(): boolean {
    return this.semilla.ambito !== "publico" && !this.o.clave;
  }

  private marcarCompleto(): void {
    if (this.completo_) return;
    this.completo_ = true;
    this.resolverCompleto?.();
  }

  get completo(): boolean {
    return this.completo_;
  }
  get cerradaYa(): boolean {
    return this.cerrada;
  }
  get capaCompletaYa(): boolean {
    return this.capaCompleta;
  }
  get superSembrando(): boolean {
    return this.sup !== null;
  }

  /* ───────────── Pares ───────────── */

  /** Un par queda enlazado (por una o varias vías). Si ya estaba, se actualizan sus vías. */
  conectarPar(par: string, vias: ViaInfo[]): void {
    if (this.cerrada || !idNeuronaValido(par) || par === this.o.idPropio || !vias.length) return;
    let p = this.pares.get(par);
    const nuevo = !p;
    if (!p) this.pares.set(par, (p = { id: par, vias: [], rol: null, completo: false, capa: false, recibioPares: new Set(), ventanaT: 0, ventanaN: 0, faltas: 0 }));
    p.vias = vias.map((v) => ({ ...v }));
    for (const v of vias) this.plan.agregarVia({ id: v.id, par, lana: v.lana, capacidadKbps: v.capacidadKbps, latenciaMs: v.latenciaMs, costo: v.costo, fiabilidad: v.fiabilidad });
    if (nuevo) this.saludar(par);
    this.planificar();
  }

  /** Quita una vía concreta (cayó el enlace) sin dar por perdido al par. */
  quitarVia(par: string, via: string): void {
    const p = this.pares.get(par);
    if (!p) return;
    p.vias = p.vias.filter((v) => v.id !== via);
    this.plan.quitarVia(via);
    if (!p.vias.length) this.quitarPar(par);
    else this.planificar();
  }

  quitarPar(par: string): void {
    this.pares.delete(par);
    this.plan.quitarPar(par);
    this.sup?.quitar(par);
    for (const [rq, c] of this.capasPedidas) if (c.par === par) this.capasPedidas.delete(rq);
    this.log(`par ${par} fuera`);
    this.planificar();
  }

  private saludar(par: string): void {
    const publico = this.semilla.ambito === "publico";
    const anuncio: MsgAnuncio = {
      t: "enj.anuncio",
      id: this.id,
      rol: this.rolPropio(),
      completo: this.completo_ && !this.sup,
      capa: this.capaCompleta,
      ...(this.o.kbpsPropios ? { kbps: this.o.kbpsPropios } : {}),
      ...(publico && this.semilla.firma ? { semilla: this.semilla } : {}),
    };
    this.enviar(par, this.mejorVia(par), anuncio);
    if (this.sup) {
      const of = this.sup.alConectar(par, this.o.reloj());
      this.enviarTengo(par, of, false);
    } else if (this.completo_) {
      this.enviar(par, this.mejorVia(par), { t: "enj.tengo", id: this.id, total: this.g.nPiezas, forma: "todo", piezas: [], inc: false });
    } else {
      const tengo = [...Array(this.g.nPiezas).keys()].filter((i) => this.plan.tiene(i));
      if (tengo.length) this.enviarTengo(par, tengo, false);
    }
  }

  private enviarTengo(par: string, piezas: number[], inc: boolean): void {
    if (!piezas.length && inc) return;
    this.enviar(par, this.mejorVia(par), { t: "enj.tengo", id: this.id, total: this.g.nPiezas, forma: piezas.length > this.g.nPiezas / 8 ? "mapa" : "rangos", piezas, inc });
  }

  /* ───────────── Entrada de mensajes ───────────── */

  /** Un mensaje llega de `par` por la vía `via`. Nunca lanza. */
  async alMensaje(par: string, via: string, crudo: unknown): Promise<void> {
    if (this.cerrada) return;
    const p = this.pares.get(par);
    if (!p) return;
    const ahora = this.o.reloj();
    if (ahora - p.ventanaT >= 1000) {
      p.ventanaT = ahora;
      p.ventanaN = 0;
    }
    if (++p.ventanaN > MAX_MENSAJES_SEGUNDO) return;
    const m = leerMensajeEnj(crudo);
    if (!m) {
      p.faltas++;
      this.log(`mensaje inválido de ${par} (${p.faltas})`);
      return;
    }
    if (m.id !== this.id) return;
    try {
      switch (m.t) {
        case "enj.anuncio":
          await this.alAnuncio(p, m);
          break;
        case "enj.tengo":
          this.alTengo(p, m);
          break;
        case "enj.pide":
          await this.servir(p, via, m);
          break;
        case "enj.trozo":
          await this.alTrozo(p, via, m);
          break;
        case "enj.no":
          this.alNo(p, m);
          break;
        case "enj.cancela":
          break;
        case "enj.pares":
          for (const x of m.pares) if (x.n !== this.o.idPropio && !this.pares.has(x.n)) this.o.alDescubrirPar?.(x.n);
          break;
        case "enj.capa":
          if (m.op === "pide") await this.servirCapa(p, via, m);
          else await this.alCapa(p, m);
          break;
        case "enj.canal":
          await this.alCanal(p, m.reg);
          break;
      }
    } catch (e) {
      this.log(`error con ${par}: ${e instanceof Error ? e.message : "?"}`);
    }
    this.vaciarNuevas();
    this.planificar();
  }

  private async alAnuncio(p: InfoPar, m: MsgAnuncio): Promise<void> {
    p.rol = m.rol;
    p.completo = m.completo;
    p.capa = m.capa;
    if (m.completo) this.plan.parCompleto(p.id);
    if (m.semilla && this.semilla.ambito === "publico" && !this.semilla.firma && m.semilla.raiz === this.semilla.raiz && m.semilla.tamano === this.semilla.tamano && m.semilla.tamanoPieza === this.semilla.tamanoPieza) {
      const ok = this.o.verificar ? await verificarSemilla(m.semilla, this.o.verificar) : false;
      if (ok) {
        this.semilla = m.semilla;
        this.log(`semilla firmada recibida de ${p.id}`);
      }
    }
  }

  private alTengo(p: InfoPar, m: MsgTengo): void {
    if (m.total !== this.g.nPiezas) {
      p.faltas++;
      return;
    }
    if (m.forma === "todo") {
      this.plan.parCompleto(p.id);
      p.completo = true;
      return;
    }
    this.plan.disponibles(p.id, m.piezas, m.inc);
    if (this.sup && this.completo_) {
      const ofertas = this.sup.alTengo(p.id, m.piezas, this.o.reloj());
      for (const [par, piezas] of ofertas) this.enviarTengo(par, piezas, true);
    }
  }

  private alNo(p: InfoPar, m: MsgNo): void {
    const pet = this.plan.peticion(m.rq);
    if (!pet || pet.par !== p.id) return;
    const motivo = m.motivo === "no-tengo" ? "no-tengo" : m.motivo === "ocupada" || m.motivo === "limite" ? "ocupada" : m.motivo === "sin-prueba" ? "sin-prueba" : "no-autorizado";
    this.plan.fallida(m.rq, motivo, this.o.reloj());
  }

  /* ───────────── Servir ───────────── */

  private async arbolSuperior(): Promise<Uint8Array[][] | null> {
    if (!this.capaCompleta) return null;
    if (this.arriba) return this.arriba;
    const capas: Uint8Array[][] = Array.from({ length: this.g.nivelPieza }, () => []);
    capas.push(this.capa as Uint8Array[]);
    let actual = capas[capas.length - 1];
    for (let h = this.g.nivelPieza; actual.length > 1; h++) {
      const sig: Uint8Array[] = [];
      for (let i = 0; i < actual.length; i += 2) sig.push(await hashPar(actual[i], i + 1 < actual.length ? actual[i + 1] : await cerosHasta(h)));
      capas.push(sig);
      actual = sig;
    }
    this.arriba = capas;
    return capas;
  }

  private async servir(p: InfoPar, via: string, m: MsgPide): Promise<void> {
    const no = (motivo: MsgNo["motivo"]) => this.enviar(p.id, via, { t: "enj.no", id: this.id, rq: m.rq, motivo });
    if (m.i >= this.g.nPiezas) return no("invalido");
    if (!(await this.o.almacen.tiene(this.semilla.raiz, m.i))) return no("no-tengo");
    if (this.sup && !this.sup.ofrecida(p.id, m.i)) return no("no-ofrecida");
    const largo = longitudPieza(this.g, m.i);
    const dec = decidirServir(
      this.ajustes,
      { ...(this.o.capacidad?.() ?? CAPACIDAD_ABIERTA), ahora: this.o.reloj(), subidasActivas: this.subiendo },
      { ambito: this.semilla.ambito, relacion: this.o.relacionDe?.(p.id) ?? "propia", bytes: largo, esRelevoCiego: this.esRelevoCiego(), par: p.id },
      this.dia,
      this.eq,
    );
    if (!dec.ok) return no(dec.motivo === "ocupada" ? "ocupada" : dec.motivo === "cuota" ? "limite" : "no-autorizado");
    let prueba: Uint8Array[] | undefined;
    if (m.prueba) {
      const capas = await this.arbolSuperior();
      if (!capas) return no("sin-prueba");
      prueba = await pruebaDeNodo(capas, this.g.nivelPieza, m.i);
    }
    this.subiendo++;
    try {
      const d = await this.o.almacen.leer(this.semilla.raiz, m.i);
      if (!d) return no("no-tengo");
      this.enviar(p.id, via, { t: "enj.trozo", id: this.id, rq: m.rq, i: m.i, d, ...(prueba ? { prueba } : {}) });
      this.bytesSubidos += d.length;
      this.dia.sumar(this.o.relacionDe?.(p.id) === "propia" || !this.o.relacionDe ? "propia" : this.semilla.ambito === "publico" ? "publico" : "grupo", d.length, this.o.reloj());
      this.eq.servidoA(p.id, d.length);
    } finally {
      this.subiendo--;
    }
  }

  private async servirCapa(p: InfoPar, via: string, m: MsgCapa): Promise<void> {
    const capas = await this.arbolSuperior();
    const r = capas ? await rangoConPrueba(capas, this.g, m.desde, m.cuantas) : null;
    if (!r) {
      this.enviar(p.id, via, { t: "enj.no", id: this.id, rq: m.rq, motivo: capas ? "invalido" : "sin-prueba" });
      return;
    }
    this.enviar(p.id, via, { t: "enj.capa", id: this.id, rq: m.rq, op: "da", desde: m.desde, cuantas: m.cuantas, hashes: r.hashes, prueba: r.prueba });
  }

  /* ───────────── Recibir trozos y capa ───────────── */

  private async alTrozo(p: InfoPar, via: string, m: MsgTrozo): Promise<void> {
    const pet = this.plan.peticion(m.rq);
    if (!pet || pet.par !== p.id || pet.pieza !== m.i) {
      p.faltas++;
      return;
    }
    await this.procesarTrozo(pet, m.d, m.prueba, via);
  }

  private async procesarTrozo(pet: Peticion, datos: Uint8Array, prueba: Uint8Array[] | undefined, via: string): Promise<void> {
    const ahora = this.o.reloj();
    const r = await this.verificarTrozo(pet.pieza, datos, prueba);
    if (!this.plan.peticion(pet.rq)) return; // se canceló o llegó antes por otra vía mientras se verificaba
    if (r === "sin-prueba") {
      this.plan.fallida(pet.rq, "sin-prueba", ahora);
      return;
    }
    if (r === "corrupto") {
      const antes = this.plan.golpesDe(pet.par);
      this.plan.fallida(pet.rq, "corrupto", ahora);
      this.log(`trozo ${pet.pieza} corrupto de ${pet.par} por ${via}: golpes par ${antes + 1}, vía ${this.plan.golpesVia(via)}${this.plan.parVetado(pet.par) ? " (par vetado)" : ""}`);
      if (pet.par.startsWith("espejo:")) {
        this.espejoPorPar(pet.par)?.marcarMalo();
        this.plan.quitarPar(pet.par);
      }
      return;
    }
    const g = await this.o.almacen.guardar(this.semilla.raiz, pet.pieza, datos);
    if (g === "cuota") {
      this.pausa = "cuota";
      this.log("almacén lleno: descarga en pausa");
      this.plan.fallida(pet.rq, "timeout", ahora);
      return;
    }
    const rr = this.plan.recibido(pet.rq, ahora);
    if (!rr) return;
    if (g === "ok") {
      this.bytesBajados += datos.length;
      this.porFuente.set(pet.par, (this.porFuente.get(pet.par) ?? 0) + datos.length);
      this.eq.recibidoDe(pet.par, datos.length);
      this.porAnunciar.push(pet.pieza);
    }
    for (const c of rr.cancelar) {
      if (!c.par.startsWith("espejo:")) this.enviar(c.par, c.via, { t: "enj.cancela", id: this.id, rq: c.rq });
    }
    if (this.plan.completo) await this.alCompletarse();
  }

  private async verificarTrozo(i: number, datos: Uint8Array, prueba?: Uint8Array[]): Promise<"ok" | "corrupto" | "sin-prueba"> {
    if (datos.length !== longitudPieza(this.g, i)) return "corrupto";
    const h = await hashPieza(datos, this.g.nivelPieza);
    if (!h) return "corrupto";
    const esperado = this.capa[i];
    if (esperado) return igualesBytes(h, esperado) ? "ok" : "corrupto";
    if (!prueba) return "sin-prueba";
    if (!(await verificarPrueba(this.g, h, this.g.nivelPieza, i, prueba, this.raizBytes))) return "corrupto";
    this.capa[i] = h;
    this.nCapa++;
    if (this.nCapa === this.g.nPiezas) await this.capaLista();
    return "ok";
  }

  private async capaLista(): Promise<void> {
    if (this.capaCompleta) return;
    this.capaCompleta = true;
    const b = new Uint8Array(this.g.nPiezas * BYTES_HASH);
    this.capa.forEach((h, i) => b.set(h!, i * BYTES_HASH));
    await this.o.almacen.guardarCapa(this.semilla.raiz, b);
    this.activarEspejos();
    this.log(`capa de piezas completa y verificada (${this.g.nPiezas} hashes)`);
  }

  private async alCapa(p: InfoPar, m: MsgCapa): Promise<void> {
    const c = this.capasPedidas.get(m.rq);
    if (!c || c.par !== p.id || c.desde !== m.desde || !m.hashes || !m.prueba) return;
    this.capasPedidas.delete(m.rq);
    if (m.cuantas !== CUANTAS_CAPA && m.cuantas !== this.cuantasCapa()) return;
    const ok = await verificarRango(this.g, m.desde, m.cuantas, m.hashes, m.prueba, this.raizBytes);
    if (!ok) {
      p.faltas++;
      this.log(`rango de capa inválido de ${p.id}`);
      return;
    }
    m.hashes.forEach((h, k) => {
      if (!this.capa[m.desde + k]) {
        this.capa[m.desde + k] = h;
        this.nCapa++;
      }
    });
    if (this.nCapa === this.g.nPiezas) await this.capaLista();
  }

  private cuantasCapa(): number {
    return Math.min(CUANTAS_CAPA, 2 ** Math.ceil(Math.log2(Math.max(1, this.g.nPiezas))));
  }

  private async recalcularCapaDesdeAlmacen(): Promise<void> {
    const hs: Uint8Array[] = [];
    for (let i = 0; i < this.g.nPiezas; i++) {
      const d = await this.o.almacen.leer(this.semilla.raiz, i);
      const h = d ? await hashPieza(d, this.g.nivelPieza) : null;
      if (!h) return;
      hs.push(h);
    }
    if (await verificarCapa(this.g, hs, this.raizBytes)) {
      this.capa = hs;
      this.nCapa = hs.length;
      await this.capaLista();
    }
  }

  private async alCompletarse(): Promise<void> {
    if (this.completo_) return;
    if (!this.capaCompleta) await this.recalcularCapaDesdeAlmacen();
    this.marcarCompleto();
    for (const par of this.pares.keys()) {
      this.enviar(par, this.mejorVia(par), { t: "enj.anuncio", id: this.id, rol: this.rolPropio(), completo: true, capa: this.capaCompleta });
    }
    this.log(`completo: ${this.bytesBajados} B bajados, ${this.bytesSubidos} B subidos`);
  }

  private vaciarNuevas(): void {
    if (!this.porAnunciar.length) return;
    const nuevas = [...new Set(this.porAnunciar)];
    this.porAnunciar = [];
    if (this.completo_) return; // el anuncio de «completo» ya lo dice todo
    for (const par of this.pares.keys()) this.enviarTengo(par, nuevas, true);
  }

  /* ───────────── Canales ───────────── */

  private async alCanal(p: InfoPar, reg: RegistroCanal): Promise<void> {
    if (!this.canales) return;
    const r = await this.canales.recibir(reg);
    if (r === "nuevo" || r === "actualizado") {
      for (const par of this.pares.keys()) if (par !== p.id) this.enviar(par, this.mejorVia(par), { t: "enj.canal", id: this.id, reg });
    } else if (r === "firma-mala") p.faltas++;
  }

  /** Publica (o reenvía) un registro de canal propio a todos los pares. */
  async publicarCanal(reg: RegistroCanal): Promise<string> {
    if (!this.canales) return "sin-almacen";
    const r = await this.canales.recibir(reg);
    if (r === "nuevo" || r === "actualizado") for (const par of this.pares.keys()) this.enviar(par, this.mejorVia(par), { t: "enj.canal", id: this.id, reg });
    return r;
  }

  /* ───────────── Espejos ───────────── */

  private espejoPorPar(par: string): FuenteEspejo | null {
    const k = Number(par.slice("espejo:".length));
    return Number.isInteger(k) ? (this.o.espejos?.[k] ?? null) : null;
  }

  private activarEspejos(): void {
    if (this.espejosActivos || !this.o.espejos?.length) return;
    this.espejosActivos = true;
    this.o.espejos.forEach((f, k) => {
      if (f.vivo) this.plan.agregarVia({ id: `espejo:${k}`, par: `espejo:${k}`, lana: "https", capacidadKbps: null, latenciaMs: 80, costo: 0.3, fiabilidad: 0.9, espejo: true });
    });
  }

  private lanzarEspejo(pet: Peticion): void {
    const f = this.espejoPorPar(pet.par);
    if (!f) {
      this.plan.fallida(pet.rq, "par-salio", this.o.reloj());
      return;
    }
    const desde = pet.pieza * this.g.tamanoPieza;
    void f.leerRango(desde, desde + longitudPieza(this.g, pet.pieza)).then((b) => {
      this.rastrear(
        (async () => {
          if (this.cerrada || !this.plan.peticion(pet.rq)) return;
          if (!b) {
            this.plan.fallida(pet.rq, "timeout", this.o.reloj());
            if (!f.vivo) this.plan.quitarPar(pet.par);
          } else await this.procesarTrozo(pet, b, undefined, pet.via);
          this.vaciarNuevas();
          this.planificar();
        })(),
      );
    });
  }

  private pedirCapaAEspejo(): void {
    if (this.espejoCapaPedida || this.capaCompleta || !this.o.espejos?.length) return;
    this.espejoCapaPedida = true;
    for (const f of this.o.espejos) {
      void f.leerCapa(this.g.nPiezas).then((hs) => {
        if (!hs) return;
        this.rastrear(
          (async () => {
            if (this.capaCompleta || !(await verificarCapa(this.g, hs, this.raizBytes))) return;
            this.capa = hs;
            this.nCapa = hs.length;
            await this.capaLista();
            this.planificar();
          })(),
        );
      });
    }
  }

  /* ───────────── Planificación ───────────── */

  private planificar(): void {
    if (this.cerrada || this.plan.completo || this.pausa) return;
    const ahora = this.o.reloj();
    for (const v of this.plan.vencidas(ahora)) {
      this.plan.fallida(v.rq, "timeout", ahora);
      this.log(`vencida: trozo ${v.pieza} por ${v.via}`);
    }
    for (const [rq, c] of this.capasPedidas) if (ahora - c.t0 > 4000) this.capasPedidas.delete(rq);
    this.pedirCapa(ahora);
    for (const pet of this.plan.siguiente(ahora)) {
      if (pet.par.startsWith("espejo:")) this.lanzarEspejo(pet);
      else this.enviar(pet.par, pet.via, { t: "enj.pide", id: this.id, rq: pet.rq, i: pet.pieza, prueba: !this.capa[pet.pieza] });
    }
  }

  private pedirCapa(ahora: number): void {
    if (this.capaCompleta) return;
    const cuantas = this.cuantasCapa();
    const enCurso = new Set([...this.capasPedidas.values()].map((c) => c.desde));
    const ocupados = new Set([...this.capasPedidas.values()].map((c) => c.par));
    const candidatos = [...this.pares.values()].filter((p) => p.capa && !ocupados.has(p.id) && !this.plan.parVetado(p.id));
    if (!candidatos.length && !this.pares.size) this.pedirCapaAEspejo();
    else if (!candidatos.length && [...this.pares.values()].every((p) => !p.capa && p.rol !== null)) this.pedirCapaAEspejo();
    let k = 0;
    for (let desde = 0; desde < nodosEnNivel(this.g, this.g.nivelPieza) && k < candidatos.length; desde += cuantas) {
      if (this.capa[desde] && this.capa[Math.min(desde + cuantas, this.g.nPiezas) - 1]) continue;
      if (enCurso.has(desde)) continue;
      const par = candidatos[k++];
      const rq = this.rqCapa++;
      this.capasPedidas.set(rq, { par: par.id, desde, t0: ahora });
      this.enviar(par.id, this.mejorVia(par.id), { t: "enj.capa", id: this.id, rq, op: "pide", desde, cuantas });
    }
  }

  /** Paso periódico (~500 ms): vencimientos, super-siembra por espera, intercambio de pares y nuevas peticiones. */
  tick(): void {
    if (this.cerrada) return;
    const ahora = this.o.reloj();
    if (this.sup) for (const [par, piezas] of this.sup.alTick(ahora)) this.enviarTengo(par, piezas, true);
    if (ahora - this.ultimoPex >= 10_000 && this.pares.size > 1) {
      this.ultimoPex = ahora;
      this.compartirPares();
    }
    this.planificar();
  }

  /** Intercambio de pares (PEX): a cada par, otros pares del enjambre que aún no le he dicho (hasta 8). */
  private compartirPares(): void {
    for (const p of this.pares.values()) {
      const otros = [...this.pares.keys()].filter((n) => n !== p.id && !p.recibioPares.has(n)).slice(0, 8);
      if (!otros.length) continue;
      otros.forEach((n) => p.recibioPares.add(n));
      this.enviar(p.id, this.mejorVia(p.id), { t: "enj.pares", id: this.id, pares: otros.map((n) => ({ n })) });
    }
  }

  /* ───────────── Lectura y cierre ───────────── */

  /** Los bytes del flujo que se reparte (texto cifrado en ámbitos no públicos). Null si falta algo. */
  async flujo(): Promise<Uint8Array | null> {
    if (!this.plan.completo) return null;
    const out = new Uint8Array(this.g.tamano);
    for (let i = 0; i < this.g.nPiezas; i++) {
      const d = await this.o.almacen.leer(this.semilla.raiz, i);
      if (!d) return null;
      out.set(d, i * this.g.tamanoPieza);
    }
    return out;
  }

  /** El contenido en claro: el flujo en ámbito público; el descifrado si hay clave. Un relé ciego devuelve null. */
  async contenido(): Promise<Uint8Array | null> {
    const f = await this.flujo();
    if (!f) return null;
    if (this.semilla.ambito === "publico") return f;
    return this.o.clave ? abrirTodo(this.o.clave, f, this.semilla.tamanoPieza) : null;
  }

  resumen(): ResumenSesion {
    const golpes: Record<string, number> = {};
    for (const par of this.pares.keys()) golpes[par] = this.plan.golpesDe(par);
    return {
      id: this.id,
      piezas: this.g.nPiezas - this.plan.faltan,
      total: this.g.nPiezas,
      completo: this.completo_,
      bytesBajados: this.bytesBajados,
      bytesSubidos: this.bytesSubidos,
      porFuente: Object.fromEntries(this.porFuente),
      golpes,
      vias: this.plan.estadoVias().map((v) => ({ id: v.id, par: v.par, kbps: Math.round(v.kbps), enVuelo: v.enVuelo, lenta: v.lenta })),
    };
  }

  async cerrar(): Promise<void> {
    if (this.cerrada) return;
    this.cerrada = true;
    await this.o.almacen.soltar(this.semilla.raiz);
  }
}

const CAPACIDAD_ABIERTA: CapacidadNeurona = { tipo: "escritorio", enCorriente: true, bateriaPct: null, enWifi: true, redMedida: false, libreBytes: null };

/**
 * Pone un contenido completo en el almacén (la neurona que lo publica pasa a ser sembradora): calcula el árbol de los
 * bytes, comprueba que la raíz es la de la semilla y guarda trozos y capa. `flujo` son los bytes que se reparten
 * (el texto cifrado en ámbitos no públicos). Devuelve false si no cuadra o no cabe.
 */
export async function cargarContenido(almacen: AlmacenTrozos, semilla: Semilla, flujo: Uint8Array): Promise<boolean> {
  const g = geometriaDeSemilla(semilla);
  if (!g || flujo.length !== g.tamano) return false;
  const arbol = await arbolDeBytes(flujo);
  if (aHex(arbol.raiz) !== semilla.raiz) return false;
  if (!(await almacen.registrar({ raiz: semilla.raiz, ambito: semilla.ambito, tamano: semilla.tamano, tamanoPieza: semilla.tamanoPieza }))) return false;
  for (let i = 0; i < g.nPiezas; i++) {
    const r = await almacen.guardar(semilla.raiz, i, flujo.slice(i * g.tamanoPieza, i * g.tamanoPieza + longitudPieza(g, i)));
    if (r !== "ok" && r !== "duplicado") return false;
  }
  const capa = new Uint8Array(g.nPiezas * BYTES_HASH);
  arbol.capas[g.nivelPieza].forEach((h, i) => capa.set(h, i * BYTES_HASH));
  await almacen.guardarCapa(semilla.raiz, capa);
  return true;
}

