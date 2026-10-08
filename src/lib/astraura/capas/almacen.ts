// Almacén inyectable para capas de Astraura (architecture/capas-autoadaptables.md §6).
// Navegador: OPFS con Cache API de respaldo.
// Pruebas: mapa en memoria.
// Sin red, sin disco, sin node:*.
// Exporta funciones puras.

import { type EntradaCapa, type Medio } from "./catalogo";

export type CapaAlmacenada = EntradaCapa & {
  buffer: ArrayBuffer;
  lastUse: number;
  fixed: boolean;
  progresoDescarga?: { trozo: number; offset: number; completado: number };
};

export interface PerfilMedio {
  presupuestoDiscoMb: number;
  presupuestoMemoriaMb: number;
}

export interface CargaDePerfil {
  permisoPersistir: () => Promise<boolean>;
}

export interface Almacenamiento {
  guardarCapa(entrada: EntradaCapa, trozos: ArrayBuffer[]): Promise<void>;
  abrirCapa(id: string): Promise<ArrayBuffer | ReadableStream | null>;
  hacerSitio(perfil: PerfilMedio, carga: CargaDePerfil): Promise<void>;
  fijar(id: string, si: boolean): void;
  estado(): CapaAlmacenada[];
}

/** Mapa en memoria para pruebas. */
export class AlmacenamientoMemoria implements Almacenamiento {
  private capas = new Map<string, CapaAlmacenada>();

  async guardarCapa(entrada: EntradaCapa, trozos: ArrayBuffer[]): Promise<void> {
    const inicio = Date.now();
    const buffer = this.concatenarTrozos(trozos);
    this.capas.set(entrada.id, {
      ...entrada,
      buffer,
      lastUse: inicio,
      fixed: false,
    });
  }

  async abrirCapa(id: string): Promise<ArrayBuffer | ReadableStream | null> {
    const cap = this.capas.get(id);
    if (!cap) return null;
    cap.lastUse = Date.now();
    if (cap.progresoDescarga) {
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (!cap.progresoDescarga) return controller.close();
          if (cap.progresoDescarga.completado >= cap.buffer.byteLength) {
            controller.enqueue(new Uint8Array(cap.buffer));
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(cap.buffer, cap.progresoDescarga.offset, Math.min(65536, cap.buffer.byteLength - cap.progresoDescarga.offset)));
          cap.progresoDescarga.offset += 65536;
          cap.progresoDescarga.completado += 65536;
        },
      });
      return stream;
    }
    return cap.buffer.slice();
  }

  async hacerSitio(perfil: PerfilMedio, carga: CargaDePerfil): Promise<void> {
    const totalMb = Array.from(this.capas.values()).reduce((s, c) => s + c.disco_mb, 0);
    if (totalMb <= perfil.presupuestoDiscoMb) return;
    const fijas = Array.from(this.capas.values()).filter((c) => c.fixed);
    const noFijas = Array.from(this.capas.values()).filter((c) => !c.fixed);
    noFijas.sort((a, b) => a.lastUse - b.lastUse);
    const aExpulsar = Math.ceil((totalMb - perfil.presupuestoDiscoMb) / 1);
    for (let i = 0; i < Math.min(aExpulsar, noFijas.length - fijas.length); i++) {
      const exp = noFijas[i];
      if (exp) this.capas.delete(exp.id);
    }
    if (Array.from(this.capas.values()).reduce((s, c) => s + c.disco_mb, 0) > perfil.presupuestoDiscoMb * 0.9) {
      const permitido = await carga.permisoPersistir();
      if (!permitido) {
        throw new Error("Presupuesto de disco excedido, persistir no permitido");
      }
    }
  }

  fijar(id: string, si: boolean): void {
    const cap = this.capas.get(id);
    if (cap) cap.fixed = si;
  }

  estado(): CapaAlmacenada[] {
    return Array.from(this.capas.values()).map((c) => ({
      ...c,
      lastUse: c.lastUse,
      fixed: c.fixed,
    }));
  }

  private async sha256(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private concatenarTrozos(trozos: ArrayBuffer[]): ArrayBuffer {
    const totalLength = trozos.reduce((acc, t) => acc + t.byteLength, 0);
    const buffer = new ArrayBuffer(totalLength);
    const view = new Uint8Array(buffer);
    let offset = 0;
    for (const t of trozos) {
      view.set(new Uint8Array(t), offset);
      offset += t.byteLength;
    }
    return buffer;
  }
}