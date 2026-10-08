// Almacén de capas de Astraura (architecture/capas-autoadaptables.md §6).
// Puro: sin node:* ni APIs del navegador concretas. El `Almacenamiento` se inyecta
// (OPFS con Cache API de respaldo en el navegador; un mapa en memoria en pruebas).

import type { EntradaCapa } from "./catalogo";

export interface Almacenamiento {
  leer(clave: string): Promise<ArrayBuffer | null>;
  escribir(clave: string, datos: ArrayBuffer): Promise<void>;
  borrar(clave: string): Promise<void>;
  claves(): Promise<string[]>;
}

export function almacenamientoEnMemoria(): Almacenamiento {
  const mapa = new Map<string, ArrayBuffer>();
  return {
    leer: async (c) => mapa.get(c)?.slice(0) ?? null,
    escribir: async (c, d) => void mapa.set(c, d.slice(0)),
    borrar: async (c) => void mapa.delete(c),
    claves: async () => [...mapa.keys()],
  };
}

/** Trozo de descarga con su SHA-256 anunciado (malla o espejo). */
export interface TrozoCapa {
  indice: number;
  sha256: string;
  datos: ArrayBuffer;
}

export interface InfoCapa {
  id: string;
  bytes: number;
  ultimoUso: number;
  fijada: boolean;
  completa: boolean;
  trozosGuardados: number;
}

export interface EstadoAlmacen {
  capas: InfoCapa[];
  usadosBytes: number;
  persistente: boolean;
}

export type ResultadoGuardar =
  | { ok: true }
  | { ok: false; motivo: "sha-trozo" | "sha-total" | "sha-desconocido" };

interface OpcionesAlmacen {
  ahora?: () => number;
  pedirPersistencia?: () => Promise<boolean>;
  /** Umbral a partir del cual se llama a `navigator.storage.persist()` (§11: 50 MB). */
  umbralPersistBytes?: number;
}

interface MetaCapa {
  bytes: number;
  ultimoUso: number;
  fijada: boolean;
  totalTrozos: number;
  completa: boolean;
  sha256: string;
}

export const UMBRAL_PERSIST_POR_DEFECTO = 50 * 1024 * 1024;

const shaHex = async (datos: ArrayBuffer): Promise<string> => {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const claveTrozo = (id: string, indice: number): string => `capa/${id}/trozo/${indice}`;
const esShaValido = (sha: string): boolean => /^[0-9a-f]{64}$/.test(sha);

/**
 * Guarda capas verificando SHA-256 por trozo y del archivo entero (§6).
 * Una capa sin su SHA en el catálogo no se usa jamás (§11).
 */
export class AlmacenCapas {
  private readonly almacen: Almacenamiento;
  private readonly ahora: () => number;
  private readonly pedirPersistencia?: () => Promise<boolean>;
  private readonly umbralPersist: number;
  private readonly metas = new Map<string, MetaCapa>();
  private llamaPersist = false;
  private pendientePersist = 0;

  constructor(almacen: Almacenamiento, opciones: OpcionesAlmacen = {}) {
    this.almacen = almacen;
    this.ahora = opciones.ahora ?? (() => Date.now());
    this.pedirPersistencia = opciones.pedirPersistencia;
    this.umbralPersist =
      opciones.umbralPersistBytes ?? UMBRAL_PERSIST_POR_DEFECTO;
  }

  /** Guarda un trozo tras verificar su SHA. Devuelve false si no cuadra. */
  async guardarTrozo(entrada: EntradaCapa, trozo: TrozoCapa): Promise<boolean> {
    if (!esShaValido(entrada.sha256)) return false;
    if (!esShaValido(trozo.sha256)) return false;
    const real = await shaHex(trozo.datos);
    if (real !== trozo.sha256) return false;
    // Solo suma bytes si el trozo no estaba ya (reanudación idempotente).
    const yaEstaba = (await this.trozosGuardados(entrada.id)).includes(trozo.indice);
    await this.almacen.escribir(claveTrozo(entrada.id, trozo.indice), trozo.datos);
    const meta = this.metas.get(entrada.id);
    const parcial: MetaCapa = meta ?? {
      bytes: 0,
      ultimoUso: this.ahora(),
      fijada: false,
      totalTrozos: 0,
      completa: false,
      sha256: entrada.sha256,
    };
    parcial.bytes += yaEstaba ? 0 : trozo.datos.byteLength;
    parcial.ultimoUso = this.ahora();
    this.metas.set(entrada.id, parcial);
    await this.contabilizarPersist(trozo.datos.byteLength);
    return true;
  }

  /** Trozos ya guardados de una capa (progreso para descarga reanudable). */
  async trozosGuardados(id: string): Promise<number[]> {
    const prefijo = `capa/${id}/trozo/`;
    return (await this.almacen.claves())
      .filter((c) => c.startsWith(prefijo))
      .map((c) => Number(c.slice(prefijo.length)))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
  }

  /**
   * Cierra la capa: concatena los trozos (guardados + los que lleguen ahora)
   * y verifica el SHA-256 del archivo entero. Si no cuadra, borra la capa.
   */
  async guardarCapa(
    entrada: EntradaCapa,
    trozos: TrozoCapa[],
  ): Promise<ResultadoGuardar> {
    if (!esShaValido(entrada.sha256)) return { ok: false, motivo: "sha-desconocido" };
    for (const t of trozos) {
      const bien = await this.guardarTrozo(entrada, t);
      if (!bien) return { ok: false, motivo: "sha-trozo" };
    }
    const indices = trozos.map((t) => t.indice).sort((a, b) => a - b);
    const partes: ArrayBuffer[] = [];
    for (const i of indices) {
      const datos = await this.almacen.leer(claveTrozo(entrada.id, i));
      if (datos === null) return { ok: false, motivo: "sha-total" };
      partes.push(datos);
    }
    const total = partes.reduce((s, p) => s + p.byteLength, 0);
    const entero = new Uint8Array(total);
    let desplaza = 0;
    for (const p of partes) {
      entero.set(new Uint8Array(p), desplaza);
      desplaza += p.byteLength;
    }
    const shaTotal = await shaHex(entero.buffer);
    if (shaTotal !== entrada.sha256) {
      await this.borrarCapa(entrada.id);
      return { ok: false, motivo: "sha-total" };
    }
    const meta = this.metas.get(entrada.id);
    this.metas.set(entrada.id, {
      bytes: total,
      ultimoUso: this.ahora(),
      fijada: meta?.fijada ?? false,
      totalTrozos: indices.length,
      completa: true,
      sha256: entrada.sha256,
    });
    return { ok: true };
  }

  async abrirCapa(id: string): Promise<ArrayBuffer | null> {
    const meta = this.metas.get(id);
    if (meta) meta.ultimoUso = this.ahora();
    const indices = await this.trozosGuardados(id);
    if (indices.length === 0) return null;
    const partes: ArrayBuffer[] = [];
    for (const i of indices) {
      const datos = await this.almacen.leer(claveTrozo(id, i));
      if (datos === null) return null;
      partes.push(datos);
    }
    const total = partes.reduce((s, p) => s + p.byteLength, 0);
    const entero = new Uint8Array(total);
    let desplaza = 0;
    for (const p of partes) {
      entero.set(new Uint8Array(p), desplaza);
      desplaza += p.byteLength;
    }
    return entero.buffer;
  }

  async fijar(id: string, si: boolean): Promise<boolean> {
    const meta = this.metas.get(id);
    if (!meta) return false;
    meta.fijada = si;
    return true;
  }

  async borrarCapa(id: string): Promise<void> {
    for (const i of await this.trozosGuardados(id)) {
      await this.almacen.borrar(claveTrozo(id, i));
    }
    this.metas.delete(id);
  }

  /**
   * Expulsa por uso más antiguo (LRU) hasta caber en el presupuesto,
   * sin tocar las fijadas. Devuelve los ids expulsados.
   */
  async hacerSitio(presupuestoBytes: number): Promise<string[]> {
    const expulsadas: string[] = [];
    let usados = (await this.estado()).usadosBytes;
    if (usados <= presupuestoBytes) return expulsadas;
    const candidatas = [...this.metas.entries()]
      .filter(([, m]) => !m.fijada)
      .sort(([, a], [, b]) => a.ultimoUso - b.ultimoUso);
    for (const [id, meta] of candidatas) {
      if (usados <= presupuestoBytes) break;
      await this.borrarCapa(id);
      usados -= meta.bytes;
      expulsadas.push(id);
    }
    return expulsadas;
  }

  async estado(): Promise<EstadoAlmacen> {
    const capas: InfoCapa[] = [];
    for (const [id, m] of this.metas) {
      capas.push({
        id,
        bytes: m.bytes,
        ultimoUso: m.ultimoUso,
        fijada: m.fijada,
        completa: m.completa,
        trozosGuardados: (await this.trozosGuardados(id)).length,
      });
    }
    capas.sort((a, b) => a.id.localeCompare(b.id));
    return {
      capas,
      usadosBytes: capas.reduce((s, c) => s + c.bytes, 0),
      persistente: this.llamaPersist,
    };
  }

  /** Al superar 50 MB escritos pide persistencia una sola vez (§11). */
  private async contabilizarPersist(bytes: number): Promise<void> {
    this.pendientePersist += bytes;
    if (this.pendientePersist < this.umbralPersist || this.llamaPersist) return;
    this.llamaPersist = true;
    if (this.pedirPersistencia) await this.pedirPersistencia();
  }
}
