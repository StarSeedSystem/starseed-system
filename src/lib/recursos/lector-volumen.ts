// Lector multifuente de volúmenes por bandas (architecture/apps-en-la-malla.md §7 · tarea J).
// Puro: red, caché y digesto inyectados; cada banda va a la fuente más rápida, varias a la vez,
// verificada, con reintento en la siguiente fuente si falla o miente, y se anota la mala.
import { bandasDeRango, elegirFuentes, type Banda, type Manifiesto } from "./volumen";
/** Caché mínima que necesita el lector (la de `cache-bandas.ts` la cumple). */
export interface CacheVolumen {
  leer(sha256: string): Promise<ArrayBuffer | null>;
  guardar(sha256: string, datos: ArrayBuffer): Promise<boolean>;
}
/** Fuente concreta: archivos-malla, Google Drive, el A1 o un vecino; se enchufa desde fuera. */
export interface FuenteBanda {
  id: string;
  /** Velocidad medida (mayor = más rápida); sin medir, 1. */
  velocidad?: number;
  pedirBanda(indice: number): Promise<Uint8Array | ArrayBuffer>;
}
export type Verificador = (datos: Uint8Array, banda: Banda) => boolean | Promise<boolean>;
export interface FuenteMala { fuente: string; banda: number; motivo: "fallo" | "sha"; }
export interface ResultadoLectura {
  /** `malas` acumula las fuentes descartadas por el lector hasta esta lectura. */
  desde: number; hasta: number; bytes: Uint8Array; malas: FuenteMala[];
}
export interface OpcionesLector {
  manifiesto: Manifiesto; cache: CacheVolumen; fuentes: FuenteBanda[];
  /** Verificación de la banda; por defecto, SHA-256 contra el manifiesto. */
  verificar?: Verificador; /** Bandas a la vez (por defecto 4). */ paralelo?: number;
}
export interface LectorVolumen {
  /** Bytes del rango de bandas [desde, hasta], ambos incluidos. */
  leer(desde: number, hasta: number): Promise<ResultadoLectura>;
  /** Prepara en caché lo que viene después; devuelve cuántas bandas quedaron listas. */
  prebuscar(rango: { desde: number; hasta: number }): Promise<number>;
  fuentesMalas(): FuenteMala[];
}
/** Verificación por defecto: el SHA-256 de los bytes contra el manifiesto. */
export async function verificarPorSha256(datos: Uint8Array, banda: Banda): Promise<boolean> {
  const sutil = globalThis.crypto?.subtle;
  if (!sutil) return false;
  try {
    const resumen = await sutil.digest("SHA-256", new Uint8Array(datos));
    const hex = [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === banda.sha256;
  } catch { return false; }
}

async function enParalelo<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const salida = new Array<R>(items.length);
  let siguiente = 0;
  const n = Math.max(1, Math.min(Math.floor(limite) || 1, items.length || 1));
  const obreros = Array.from({ length: n }, async () => {
    while (true) {
      const i = siguiente++;
      if (i >= items.length) return;
      salida[i] = await fn(items[i]);
    }
  });
  await Promise.all(obreros);
  return salida;
}

export function crearLector(opciones: OpcionesLector): LectorVolumen {
  const { manifiesto, cache, fuentes } = opciones;
  const verificar = opciones.verificar ?? verificarPorSha256;
  const paralelo = Math.max(1, Math.floor(opciones.paralelo ?? 4));
  const malas: FuenteMala[] = [];
  const anotar = (m: FuenteMala): void => {
    if (!malas.some((x) => x.fuente === m.fuente && x.banda === m.banda && x.motivo === m.motivo)) {
      malas.push(m);
    }
  };

  const cargar = async (banda: Banda): Promise<Uint8Array> => {
    const guardada = await cache.leer(banda.sha256).catch(() => null);
    if (guardada) return new Uint8Array(guardada);
    const ofertas = fuentes.map((f) => ({
      id: f.id, indice: banda.indice, velocidad: f.velocidad ?? 1, permitted: true,
    }));
    for (const elegida of elegirFuentes(manifiesto, banda.indice, [], ofertas)) {
      const fuente = fuentes.find((f) => f.id === elegida.id);
      if (!fuente) continue;
      let bytes: Uint8Array;
      try {
        const crudo = await fuente.pedirBanda(banda.indice);
        bytes = crudo instanceof Uint8Array ? crudo : new Uint8Array(crudo);
      } catch {
        anotar({ fuente: fuente.id, banda: banda.indice, motivo: "fallo" });
        continue;
      }
      if (!(await verificar(bytes, banda))) {
        anotar({ fuente: fuente.id, banda: banda.indice, motivo: "sha" });
        continue;
      }
      const copia = new Uint8Array(bytes);
      await cache.guardar(banda.sha256, copia.buffer).catch(() => false);
      return copia;
    }
    throw new Error(`banda ${banda.indice} sin fuente verificable`);
  };

  const leer = async (desde: number, hasta: number): Promise<ResultadoLectura> => {
    const lista = bandasDeRango(manifiesto, desde, hasta);
    const partes = await enParalelo(lista, paralelo, cargar);
    const bytes = new Uint8Array(partes.reduce((s, p) => s + p.byteLength, 0));
    let pos = 0;
    for (const p of partes) { bytes.set(p, pos); pos += p.byteLength; }
    return { desde, hasta, bytes, malas: malas.slice() };
  };

  return {
    leer,
    async prebuscar(rango) {
      const lista = bandasDeRango(manifiesto, rango.desde, rango.hasta);
      const hechos = await enParalelo<Banda, number>(lista, paralelo, async (b) => {
        try { await cargar(b); return 1; } catch { return 0; }
      });
      return hechos.reduce((s, n) => s + n, 0);
    },
    fuentesMalas: () => malas.slice(),
  };
}
