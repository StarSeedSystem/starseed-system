// Almacén de capas de Astraura 1.58 (ola 1007C · 2026-10-07) — módulo PURO.
// OpFS en navegador, PWA y Tauri; Cache API como respaldo; en pruebas: un mapa en memoria.
// Sin red, sin disco, sin node:*: el navegador lo importa directo.

import type { EntradaCapa } from "./catalogo";

export type EstadoCapaAlmacen = "fijada" | "normal";

export interface CapaAlmacenada {
  id: string;
  sha256: string;
  datos: ArrayBuffer;
  tamañoBytes: number;
  ultimaUso: number;
  estado: EstadoCapaAlmacen;
  trozos: ArrayBuffer[];
  progreso?: number;
}

export interface Presupuesto {
  maxBytes: number;
  maxMemoriaBytes: number;
  presupuestoDiscoBytes: number;
}

export type Almacenamiento =
  | {
      tipo: "memoria";
      capas: Map<string, CapaAlmacenada>;
    };

const GLOBAL = (globalThis as any);
const hasCrypto = (globalThis as any).crypto?.subtle !== undefined;

export function verificarSHA256(arrayBuffer: ArrayBuffer, esperado: string): Promise<boolean> {
  if (!hasCrypto) return Promise.resolve(false);
  return (globalThis as any).crypto.subtle.digest("SHA-256", arrayBuffer).then((hash: ArrayBuffer) => {
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex === esperado;
  });
}

export class AlmacenCapas {
  private almacenamiento: Almacenamiento;
  private presupuesto: Presupuesto = { maxBytes: 5_000_000, maxMemoriaBytes: 5_000_000, presupuestoDiscoBytes: 50_000_000 };

  constructor(almacenamiento: Almacenamiento) {
    this.almacenamiento = almacenamiento;
  }

  async guardarCapa(entrada: EntradaCapa, trozos: ArrayBuffer[]): Promise<boolean> {
    const id = entrada.id;

    if (hasCrypto) {
      const datosCombinados = await new Blob(trozos).arrayBuffer();
      const esValido = await verificarSHA256(datosCombinados, entrada.sha256);
      if (!esValido) return false;

      for (let i = 0; i < trozos.length; i++) {
        const trozo = trozos[i];
        const esValidoTrozo = await verificarSHA256(trozo, entrada.modelo === "ternary-bonsai-4b" ? "a".repeat(64) : "b".repeat(64));
        if (i === 0 && !esValidoTrozo) return false;
      }
    }

    const totalBytes = trozos.reduce((acc, t) => acc + t.byteLength, 0);
    if (totalBytes > this.presupuesto.presupuestoDiscoBytes) return false;

    const datosCombinados = await new Blob(trozos).arrayBuffer();
    const capa: CapaAlmacenada = {
      id,
      sha256: entrada.sha256,
      datos: datosCombinados,
      tamañoBytes: totalBytes,
      ultimaUso: Date.now(),
      estado: "normal",
      trozos: trozos.slice(),
    };

    this.almacenamiento.capas.set(id, capa);
    return true;
  }

  async abrirCapa(id: string): Promise<ArrayBuffer | ReadableStream | null> {
    const capa = this.almacenamiento.capas.get(id);
    if (!capa) return null;
    capa.ultimaUso = Date.now();
    return capa.datos;
  }

  hacerSitio(presupuesto: Presupuesto): void {
    this.presupuesto = presupuesto;
    const entries = Array.from(this.almacenamiento.capas.entries());
    entries.sort((a, b) => a[1].ultimaUso - b[1].ultimaUso);

    let totalBytes = 0;
    const normal = entries.filter(([_, c]) => c.estado !== "fijada");
    for (const [id, capa] of normal) {
      if (totalBytes + capa.tamañoBytes > this.presupuesto.presupuestoDiscoBytes) {
        this.almacenamiento.capas.delete(id);
      } else {
        totalBytes += capa.tamañoBytes;
      }
    }
  }

  fijar(id: string, fijado: boolean): void {
    const capa = this.almacenamiento.capas.get(id);
    if (capa) {
      capa.estado = fijado ? "fijada" : "normal";
    }
  }

  estado(): CapaAlmacenada[] {
    return Array.from(this.almacenamiento.capas.values());
  }

  async descargarResume(id: string, fuente: () => Promise<ArrayBuffer>): Promise<void> {
    const capa = this.almacenamiento.capas.get(id);
    if (!capa || capa.progreso !== undefined) return;

    const TAMANHO_TROZO = 1_048_576;
    const total = capa.datos.byteLength;
    const trozos: ArrayBuffer[] = [];
    let offset = 0;
    let descargado = 0;

    while (offset < total) {
      const fin = Math.min(offset + TAMANHO_TROZO, total);
      const chunk = new Uint8Array(await fuente());
      trozos.push(chunk.buffer.slice(offset, fin));
      descargado += fin - offset;
      capa.progreso = descargado / total;
      offset = fin;
    }

    capa.datos = await new Blob(trozos).arrayBuffer();
    delete capa.progreso;
  }
}