// Lector multifuente de volúmenes por bandas (architecture/apps-en-la-malla.md §7 · tarea J).
// Puro: fuentes, caché, reloj y verificación llegan inyectados; sin red, disco ni `node:*`.

import type { CacheBandas } from "./cache-bandas";
import { sha256Hex } from "./cache-bandas";
import { elegirFuentes, type Manifiesto } from "./volumen";

export interface FuenteVolumen {
  id: string;
  pedirBanda(indice: number): Promise<Uint8Array>;
  /** Velocidad media conocida (mayor = más rápida); se afina con cada lectura. */
  velocidad?: number;
}

export interface FuenteMala { fuente: string; banda: number; motivo: "fallo" | "sha" }
export interface Rango { desde: number; hasta: number }
export interface OpcionesLector {
  manifiesto: Manifiesto;
  cache: CacheBandas;
  fuentes: FuenteVolumen[];
  /** Comprueba el SHA-256 anunciado; por defecto usa `crypto.subtle`. */
  verificar?: (datos: Uint8Array, sha256: string) => boolean | Promise<boolean>;
  /** Bandas pedidas a la vez (mínimo 1). */
  paralelo?: number;
  /** Reloj inyectable para medir la velocidad real de cada fuente (ms). */
  ahora?: () => number;
}
export interface LectorVolumen {
  /** Bytes del rango [desde, hasta) ya verificados; falla si ninguna fuente los entrega. */
  leer(desde: number, hasta: number): Promise<Uint8Array>;
  prebuscar(rango: Rango | [number, number]): Promise<void>;
  fuentesMalas(): FuenteMala[];
}

const aArrayBuffer = (datos: Uint8Array): ArrayBuffer => datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer;
async function verificarPorDefecto(datos: Uint8Array, sha256: string): Promise<boolean> {
  const hex = await sha256Hex(aArrayBuffer(datos));
  return hex !== null && hex === sha256;
}
export function crearLector(opciones: OpcionesLector): LectorVolumen {
  const { manifiesto, cache, fuentes } = opciones;
  const verificar = opciones.verificar ?? verificarPorDefecto;
  const paralelo = Math.max(1, Math.floor(opciones.paralelo ?? 4));
  const ahora = opciones.ahora ?? (() => Date.now());
  const malas: FuenteMala[] = [], medidas = new Map<string, number>(), enVuelo = new Map<number, Promise<Uint8Array>>();

  const indicesDe = (desde: number, hasta: number): number[] => {
    const inicio = Math.max(0, Math.floor(desde)), fin = Math.min(manifiesto.tamano, Math.ceil(hasta));
    const indices: number[] = [];
    for (let i = Math.floor(inicio / manifiesto.banda); fin > inicio && i <= Math.floor((fin - 1) / manifiesto.banda); i++) indices.push(i);
    return indices;
  };

  async function cargarBanda(indice: number): Promise<Uint8Array> {
    const banda = manifiesto.bandas.find((b) => b.indice === indice);
    if (!banda) throw new Error(`La banda ${indice} no está en el manifiesto`);
    const guardada = await cache.leer(banda.sha256);
    if (guardada) return new Uint8Array(guardada);
    const tenedores = fuentes.map((f) => ({ id: f.id, indice, velocidad: medidas.get(f.id) ?? f.velocidad ?? 0, permitted: true }));
    for (const elegida of elegirFuentes(manifiesto, indice, tenedores, [])) {
      const fuente = fuentes.find((f) => f.id === elegida.id);
      if (!fuente) continue;
      const inicio = ahora();
      try {
        const datos = await fuente.pedirBanda(indice), ms = Math.max(1, ahora() - inicio);
        if (datos.byteLength !== banda.bytes || !(await verificar(datos, banda.sha256))) {
          malas.push({ fuente: fuente.id, banda: indice, motivo: "sha" });
          continue;
        }
        medidas.set(fuente.id, datos.byteLength / ms);
        try { await cache.guardar(banda.sha256, aArrayBuffer(datos)); } catch { /* caché llena: los bytes ya están verificados */ }
        return datos;
      } catch {
        malas.push({ fuente: fuente.id, banda: indice, motivo: "fallo" });
      }
    }
    throw new Error(`Ninguna fuente pudo entregar la banda ${indice} verificada`);
  }

  const cargarUna = (indice: number): Promise<Uint8Array> => {
    const promesa = enVuelo.get(indice) ?? cargarBanda(indice).finally(() => enVuelo.delete(indice));
    enVuelo.set(indice, promesa);
    return promesa;
  };

  const porTandas = async (indices: number[], tarea: (i: number) => Promise<void>): Promise<void> => {
    let siguiente = 0;
    const trabajar = async (): Promise<void> => {
      for (let pos = siguiente++; pos < indices.length; pos = siguiente++) await tarea(indices[pos]);
    };
    await Promise.all(Array.from({ length: Math.min(paralelo, indices.length) }, trabajar));
  };

  const unir = (datos: Map<number, Uint8Array>, desde: number, hasta: number): Uint8Array => {
    const inicio = Math.max(0, Math.floor(desde)), fin = Math.min(manifiesto.tamano, Math.ceil(hasta));
    const salida = new Uint8Array(Math.max(0, fin - inicio));
    for (const [indice, bloque] of datos) {
      const base = indice * manifiesto.banda, desdeBloque = Math.max(0, inicio - base);
      const hastaBloque = Math.min(bloque.byteLength, fin - base);
      if (hastaBloque > desdeBloque) salida.set(bloque.subarray(desdeBloque, hastaBloque), base + desdeBloque - inicio);
    }
    return salida;
  };

  return {
    async leer(desde, hasta) {
      const datos = new Map<number, Uint8Array>();
      await porTandas(indicesDe(desde, hasta), async (i) => void datos.set(i, await cargarUna(i)));
      return unir(datos, desde, hasta);
    },
    async prebuscar(rango) {
      const [desde, hasta] = Array.isArray(rango) ? rango : [rango.desde, rango.hasta];
      await porTandas(indicesDe(desde, hasta), async (i) => {
        try { await cargarUna(i); } catch { /* especulativo: la lectura real lo reintentará */ }
      });
    },
    fuentesMalas: () => [...malas],
  };
}
