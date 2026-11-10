/**
 * almacen — almacén de trozos DIRECCIONADO POR CONTENIDO (ENJ1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/enjambre-datos.md` §8. Un contenido se identifica por su raíz Merkle; sus trozos se
 * guardan por índice. Una interfaz (`AlmacenTrozos`), una lógica común (`AlmacenBase`: cuentas, cuotas por
 * ámbito, fijado, referencias y desalojo LRU) y dos soportes: memoria (pruebas) y OPFS (la app).
 *
 *  · fijar(raiz): el contenido no se desaloja nunca («Fijar» de la interfaz).
 *  · retener/soltar: una sesión de enjambre que lo usa lo retiene mientras trabaja (referencias).
 *  · cuota por ámbito: antes de rechazar un trozo por cuota se desaloja lo menos usado de ese ámbito que NO
 *    esté fijado ni retenido. El desalojo es de contenido entero (un contenido a medias no sirve a nadie).
 *  · El almacén no verifica hashes: lo hace quien llama antes de guardar (la sesión del enjambre).
 */

import { geometria, longitudPieza } from "./arbol";
import { AMBITOS, type Ambito } from "./semilla";

export interface InfoContenido {
  raiz: string;
  ambito: Ambito;
  tamano: number;
  tamanoPieza: number;
  nPiezas: number;
  /** Trozos guardados. */
  piezas: number;
  /** Bytes guardados. */
  bytes: number;
  completo: boolean;
  fijado: boolean;
  refs: number;
  /** Marca de uso (monótona): menor = más antiguo. */
  tocado: number;
}

export type ResultadoGuardar = "ok" | "duplicado" | "cuota" | "desconocido" | "invalido";

export interface DatosContenido {
  raiz: string;
  ambito: Ambito;
  tamano: number;
  tamanoPieza: number;
}

export interface AlmacenTrozos {
  registrar(c: DatosContenido): Promise<boolean>;
  info(raiz: string): Promise<InfoContenido | null>;
  lista(): Promise<InfoContenido[]>;
  tiene(raiz: string, i: number): Promise<boolean>;
  /** Índices guardados, ordenados. */
  piezas(raiz: string): Promise<number[]>;
  leer(raiz: string, i: number): Promise<Uint8Array | null>;
  guardar(raiz: string, i: number, datos: Uint8Array): Promise<ResultadoGuardar>;
  /** Capa de piezas verificada (32 bytes por trozo, concatenados). */
  guardarCapa(raiz: string, capa: Uint8Array): Promise<void>;
  leerCapa(raiz: string): Promise<Uint8Array | null>;
  fijar(raiz: string, fijo: boolean): Promise<boolean>;
  retener(raiz: string): Promise<void>;
  soltar(raiz: string): Promise<void>;
  quitar(raiz: string): Promise<boolean>;
  bytesPorAmbito(): Promise<Record<Ambito, number>>;
  /** Libera al menos `necesarios` bytes de `ambito` (o de todos si se omite). Devuelve lo liberado. */
  desalojar(necesarios: number, ambito?: Ambito): Promise<number>;
}

export type Cuotas = Partial<Record<Ambito, number>>;

interface Entrada {
  d: DatosContenido;
  piezas: Set<number>;
  bytes: number;
  fijado: boolean;
  refs: number;
  tocado: number;
  nPiezas: number;
}

/** Lógica común. Los soportes implementan solo las operaciones `crudo*`. */
export abstract class AlmacenBase implements AlmacenTrozos {
  protected entradas = new Map<string, Entrada>();
  private reloj = 0;
  protected cuotas: Cuotas;

  constructor(cuotas: Cuotas = {}) {
    this.cuotas = cuotas;
  }

  protected abstract crudoGuardar(raiz: string, i: number, datos: Uint8Array): Promise<void>;
  protected abstract crudoLeer(raiz: string, i: number): Promise<Uint8Array | null>;
  protected abstract crudoBorrar(raiz: string): Promise<void>;
  protected abstract crudoGuardarCapa(raiz: string, capa: Uint8Array): Promise<void>;
  protected abstract crudoLeerCapa(raiz: string): Promise<Uint8Array | null>;
  /** Persistir el índice del contenido (lo llama la base tras cada cambio de estado). */
  protected async persistir(_raiz: string): Promise<void> {}

  fijarCuotas(c: Cuotas): void {
    this.cuotas = c;
  }

  private tocar(e: Entrada): void {
    e.tocado = ++this.reloj;
  }

  private info_(e: Entrada): InfoContenido {
    return {
      raiz: e.d.raiz,
      ambito: e.d.ambito,
      tamano: e.d.tamano,
      tamanoPieza: e.d.tamanoPieza,
      nPiezas: e.nPiezas,
      piezas: e.piezas.size,
      bytes: e.bytes,
      completo: e.piezas.size === e.nPiezas,
      fijado: e.fijado,
      refs: e.refs,
      tocado: e.tocado,
    };
  }

  async registrar(c: DatosContenido): Promise<boolean> {
    const g = geometria(c.tamano, c.tamanoPieza);
    if (!g || !/^[0-9a-f]{64}$/.test(c.raiz)) return false;
    const previo = this.entradas.get(c.raiz);
    if (previo) {
      this.tocar(previo);
      return true;
    }
    const e: Entrada = { d: { ...c }, piezas: new Set(), bytes: 0, fijado: false, refs: 0, tocado: 0, nPiezas: g.nPiezas };
    this.tocar(e);
    this.entradas.set(c.raiz, e);
    await this.persistir(c.raiz);
    return true;
  }

  async info(raiz: string): Promise<InfoContenido | null> {
    const e = this.entradas.get(raiz);
    return e ? this.info_(e) : null;
  }

  async lista(): Promise<InfoContenido[]> {
    return [...this.entradas.values()].map((e) => this.info_(e));
  }

  async tiene(raiz: string, i: number): Promise<boolean> {
    return this.entradas.get(raiz)?.piezas.has(i) ?? false;
  }

  async piezas(raiz: string): Promise<number[]> {
    const e = this.entradas.get(raiz);
    return e ? [...e.piezas].sort((a, b) => a - b) : [];
  }

  async leer(raiz: string, i: number): Promise<Uint8Array | null> {
    const e = this.entradas.get(raiz);
    if (!e || !e.piezas.has(i)) return null;
    const d = await this.crudoLeer(raiz, i);
    if (d) this.tocar(e);
    return d;
  }

  private usado(ambito: Ambito): number {
    let n = 0;
    for (const e of this.entradas.values()) if (e.d.ambito === ambito) n += e.bytes;
    return n;
  }

  async guardar(raiz: string, i: number, datos: Uint8Array): Promise<ResultadoGuardar> {
    const e = this.entradas.get(raiz);
    if (!e) return "desconocido";
    const g = geometria(e.d.tamano, e.d.tamanoPieza);
    if (!g || !Number.isInteger(i) || i < 0 || i >= g.nPiezas || datos.length !== longitudPieza(g, i)) return "invalido";
    if (e.piezas.has(i)) return "duplicado";
    const tope = this.cuotas[e.d.ambito];
    if (tope !== undefined && this.usado(e.d.ambito) + datos.length > tope) {
      // Se retiene para que el desalojo no se lleve el contenido que está creciendo.
      e.refs++;
      try {
        await this.desalojar(this.usado(e.d.ambito) + datos.length - tope, e.d.ambito);
      } finally {
        e.refs--;
      }
      if (this.usado(e.d.ambito) + datos.length > tope) return "cuota";
    }
    await this.crudoGuardar(raiz, i, datos);
    e.piezas.add(i);
    e.bytes += datos.length;
    this.tocar(e);
    await this.persistir(raiz);
    return "ok";
  }

  async guardarCapa(raiz: string, capa: Uint8Array): Promise<void> {
    if (this.entradas.has(raiz)) await this.crudoGuardarCapa(raiz, capa);
  }

  async leerCapa(raiz: string): Promise<Uint8Array | null> {
    return this.entradas.has(raiz) ? this.crudoLeerCapa(raiz) : null;
  }

  async fijar(raiz: string, fijo: boolean): Promise<boolean> {
    const e = this.entradas.get(raiz);
    if (!e) return false;
    e.fijado = fijo;
    await this.persistir(raiz);
    return true;
  }

  async retener(raiz: string): Promise<void> {
    const e = this.entradas.get(raiz);
    if (e) {
      e.refs++;
      this.tocar(e);
    }
  }

  async soltar(raiz: string): Promise<void> {
    const e = this.entradas.get(raiz);
    if (e && e.refs > 0) e.refs--;
  }

  async quitar(raiz: string): Promise<boolean> {
    const e = this.entradas.get(raiz);
    if (!e || e.refs > 0) return false;
    this.entradas.delete(raiz);
    await this.crudoBorrar(raiz);
    return true;
  }

  async bytesPorAmbito(): Promise<Record<Ambito, number>> {
    const out = { privado: 0, grupo: 0, comunidad: 0, publico: 0 } as Record<Ambito, number>;
    for (const a of AMBITOS) out[a] = this.usado(a);
    return out;
  }

  async desalojar(necesarios: number, ambito?: Ambito): Promise<number> {
    const candidatos = [...this.entradas.values()]
      .filter((e) => !e.fijado && e.refs === 0 && e.bytes > 0 && (ambito === undefined || e.d.ambito === ambito))
      .sort((a, b) => a.tocado - b.tocado);
    let liberado = 0;
    for (const e of candidatos) {
      if (liberado >= necesarios) break;
      liberado += e.bytes;
      this.entradas.delete(e.d.raiz);
      await this.crudoBorrar(e.d.raiz);
    }
    return liberado;
  }
}

/* ───────────────────────────── En memoria ───────────────────────────── */

export class AlmacenMemoria extends AlmacenBase {
  private datos = new Map<string, Map<number, Uint8Array>>();
  private capas = new Map<string, Uint8Array>();

  protected async crudoGuardar(raiz: string, i: number, d: Uint8Array): Promise<void> {
    let m = this.datos.get(raiz);
    if (!m) this.datos.set(raiz, (m = new Map()));
    m.set(i, d.slice());
  }
  protected async crudoLeer(raiz: string, i: number): Promise<Uint8Array | null> {
    return this.datos.get(raiz)?.get(i)?.slice() ?? null;
  }
  protected async crudoBorrar(raiz: string): Promise<void> {
    this.datos.delete(raiz);
    this.capas.delete(raiz);
  }
  protected async crudoGuardarCapa(raiz: string, capa: Uint8Array): Promise<void> {
    this.capas.set(raiz, capa.slice());
  }
  protected async crudoLeerCapa(raiz: string): Promise<Uint8Array | null> {
    return this.capas.get(raiz)?.slice() ?? null;
  }
}

/* ───────────────────────────── OPFS ───────────────────────────── */

/** Lo mínimo que se usa del sistema de archivos privado del origen (compatible con `FileSystemDirectoryHandle`). */
export interface DirOPFS {
  getDirectoryHandle(nombre: string, o?: { create?: boolean }): Promise<DirOPFS>;
  getFileHandle(nombre: string, o?: { create?: boolean }): Promise<ArchivoOPFS>;
  removeEntry(nombre: string, o?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterable<[string, DirOPFS | ArchivoOPFS]>;
}
export interface ArchivoOPFS {
  kind?: string;
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<{ write(d: Uint8Array | string): Promise<void>; close(): Promise<void> }>;
}

interface MetaDisco {
  v: 1;
  d: DatosContenido;
  piezas: number[];
  bytes: number;
  fijado: boolean;
}

/**
 * Soporte OPFS: `<raíz del almacén>/<raíz del contenido>/{meta.json, capa.bin, p<i>.bin}`.
 * `abrir()` recorre lo guardado y reconstruye el índice; un contenido con `meta.json` ilegible se ignora.
 */
export class AlmacenOPFS extends AlmacenBase {
  private constructor(
    private readonly raizDir: DirOPFS,
    cuotas: Cuotas,
  ) {
    super(cuotas);
  }

  static async abrir(raizDir: DirOPFS, cuotas: Cuotas = {}): Promise<AlmacenOPFS> {
    const a = new AlmacenOPFS(raizDir, cuotas);
    try {
      for await (const [nombre, h] of raizDir.entries()) {
        if (!/^[0-9a-f]{64}$/.test(nombre) || (h as ArchivoOPFS).kind === "file") continue;
        try {
          const f = await (h as DirOPFS).getFileHandle("meta.json");
          const m = JSON.parse(new TextDecoder().decode(await (await f.getFile()).arrayBuffer())) as MetaDisco;
          const g = geometria(m.d.tamano, m.d.tamanoPieza);
          if (m.v !== 1 || !g || m.d.raiz !== nombre) continue;
          a.entradas.set(nombre, { d: m.d, piezas: new Set(m.piezas.filter((i) => Number.isInteger(i) && i >= 0 && i < g.nPiezas)), bytes: m.bytes, fijado: m.fijado, refs: 0, tocado: 0, nPiezas: g.nPiezas });
        } catch {
          /* contenido sin índice legible: se ignora */
        }
      }
    } catch {
      /* directorio no recorrible: arranca vacío */
    }
    return a;
  }

  /** Almacén sobre el OPFS del navegador / WebView (`navigator.storage.getDirectory()`). */
  static async delNavegador(nombre = "starseed-enjambre", cuotas: Cuotas = {}): Promise<AlmacenOPFS | null> {
    try {
      const raiz = (await (navigator as unknown as { storage: { getDirectory(): Promise<DirOPFS> } }).storage.getDirectory()).getDirectoryHandle(nombre, { create: true });
      return await AlmacenOPFS.abrir(await raiz, cuotas);
    } catch {
      return null;
    }
  }

  private async dir(raiz: string): Promise<DirOPFS> {
    return this.raizDir.getDirectoryHandle(raiz, { create: true });
  }

  private async escribir(raiz: string, nombre: string, d: Uint8Array | string): Promise<void> {
    const f = await (await this.dir(raiz)).getFileHandle(nombre, { create: true });
    const w = await f.createWritable();
    await w.write(d);
    await w.close();
  }

  private async leerArchivo(raiz: string, nombre: string): Promise<Uint8Array | null> {
    try {
      const f = await (await this.dir(raiz)).getFileHandle(nombre);
      return new Uint8Array(await (await f.getFile()).arrayBuffer());
    } catch {
      return null;
    }
  }

  protected crudoGuardar(raiz: string, i: number, d: Uint8Array): Promise<void> {
    return this.escribir(raiz, `p${i}.bin`, d);
  }
  protected crudoLeer(raiz: string, i: number): Promise<Uint8Array | null> {
    return this.leerArchivo(raiz, `p${i}.bin`);
  }
  protected async crudoBorrar(raiz: string): Promise<void> {
    try {
      await this.raizDir.removeEntry(raiz, { recursive: true });
    } catch {
      /* ya no estaba */
    }
  }
  protected crudoGuardarCapa(raiz: string, capa: Uint8Array): Promise<void> {
    return this.escribir(raiz, "capa.bin", capa);
  }
  protected crudoLeerCapa(raiz: string): Promise<Uint8Array | null> {
    return this.leerArchivo(raiz, "capa.bin");
  }
  protected async persistir(raiz: string): Promise<void> {
    const e = this.entradas.get(raiz);
    if (!e) return;
    const m: MetaDisco = { v: 1, d: e.d, piezas: [...e.piezas], bytes: e.bytes, fijado: e.fijado };
    try {
      await this.escribir(raiz, "meta.json", JSON.stringify(m));
    } catch {
      /* sin espacio: el índice se rehace al siguiente cambio */
    }
  }
}
