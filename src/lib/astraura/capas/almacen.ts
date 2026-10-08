// Almacén de capas — módulo puro, sin node:*. Contrato §6.

export interface TrozoCapa {
  indice: number; sha256: string; datos: ArrayBuffer;
}
export interface EntradaCapaCatalogo { id: string; sha256: string; }
export interface PerfilMedio { presupuestoBytes: number; }
export interface EstadoCapa {
  id: string; bytes: number; ultimoUso: number; fijada: boolean;
  trozosCompletos: number; trozosTotales: number;
}
export interface Almacenamiento {
  guardarCapa(entrada: EntradaCapaCatalogo, trozos: TrozoCapa[]): Promise<string>;
  abrirCapa(id: string): Promise<ArrayBuffer | ReadableStream<Uint8Array>>;
  hacerSitio(presupuesto: number, perfilMedio: PerfilMedio): Promise<number>;
  fijar(id: string, si: boolean): Promise<void>;
  estado(): Promise<Record<string, EstadoCapa>>;
}

export async function sha256Buffer(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function concatArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const r = new Uint8Array(total);
  let o = 0;
  for (const b of buffers) { r.set(new Uint8Array(b), o); o += b.byteLength; }
  return r.buffer;
}

export class AlmacenEnMemoria implements Almacenamiento {
  private capas = new Map<string, { id: string; datos: ArrayBuffer; completados: number; total: number; fijada: boolean; uso: number; progreso: Map<number, boolean> }>();
  async guardarCapa(entrada: EntradaCapaCatalogo, trozos: TrozoCapa[]): Promise<string> {
    for (const t of trozos) {
      const sha = await sha256Buffer(t.datos);
      if (sha !== t.sha256) throw new Error(`Trozo ${t.indice} SHA-256 incorrecto: esperado ${t.sha256}, obtenido ${sha}`);
    }
    const datos = concatArrayBuffers(trozos.map(t => t.datos));
    const shaC = await sha256Buffer(datos);
    if (shaC !== entrada.sha256) throw new Error(`Archivo completo SHA-256 incorrecto: esperado ${entrada.sha256}, obtenido ${shaC}`);
    const prog = new Map<number, boolean>();
    for (const t of trozos) prog.set(t.indice, true);
    this.capas.set(entrada.id, { id: entrada.id, datos, completados: trozos.length, total: trozos.length, fijada: false, uso: Date.now(), progreso: prog });
    return entrada.id;
  }
  async abrirCapa(id: string): Promise<ArrayBuffer | ReadableStream<Uint8Array>> {
    const c = this.capas.get(id); if (!c) throw new Error(`Capa no encontrada: ${id}`);
    c.uso = Date.now(); return c.datos.slice(0);
  }
  async hacerSitio(presupuesto: number, perfilMedio: PerfilMedio): Promise<number> {
    const bytes = Math.min(presupuesto, perfilMedio.presupuestoBytes);
    let usado = 0; for (const c of this.capas.values()) usado += c.datos.byteLength;
    if (usado <= bytes) return 0;
    const ordenados = Array.from(this.capas.values()).filter(c => !c.fijada).sort((a, b) => a.uso - b.uso);
    let liberado = 0;
    for (const c of ordenados) { if (usado - liberado <= bytes) break; liberado += c.datos.byteLength; this.capas.delete(c.id); }
    return liberado;
  }
  async fijar(id: string, si: boolean): Promise<void> {
    const c = this.capas.get(id); if (!c) throw new Error(`Capa no encontrada: ${id}`); c.fijada = si;
  }
  async estado(): Promise<Record<string, EstadoCapa>> {
    const res: Record<string, EstadoCapa> = {};
    for (const [id, c] of this.capas.entries()) res[id] = { id, bytes: c.datos.byteLength, ultimoUso: c.uso, fijada: c.fijada, trozosCompletos: c.completados, trozosTotales: c.total };
    return res;
  }
  reanudarProgreso(id: string, trozos: TrozoCapa[]): boolean {
    const c = this.capas.get(id); if (!c) return false;
    for (const t of trozos) c.progreso.set(t.indice, true);
    c.completados = c.progreso.size; return true;
  }
}

export async function persistirSiSupera50MB(bytesActuales: number, perfilMedio: PerfilMedio): Promise<boolean> {
  if (bytesActuales < 50 * 1024 * 1024) return false;
  try { if (typeof navigator !== "undefined" && (navigator as any).storage?.persist) return await (navigator as any).storage.persist(); } catch {}
  if (bytesActuales > perfilMedio.presupuestoBytes) throw new Error(`Presupuesto excedido: ${bytesActuales} > ${perfilMedio.presupuestoBytes}`);
  return true;
}

export function crearAlmacen(): Almacenamiento { return new AlmacenEnMemoria(); }
