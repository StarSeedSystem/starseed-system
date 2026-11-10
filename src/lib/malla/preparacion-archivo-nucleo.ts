/**
 * preparacion-archivo-nucleo — el SHA-256 por trozos de un archivo, leído en bloques (ARC1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * La MISMA raíz que `calcularHashLista` de `archivos-malla.ts` (hash de cada trozo; hash final sobre la concatenación
 * de los hashes de trozo), pero:
 *   · lee el archivo en BLOQUES de ~4 MiB (no un `slice().arrayBuffer()` por trozo de 63 KiB: en el WebView de Android
 *     cada lectura de un archivo grande cuesta un viaje al proveedor de contenidos) y nunca lo tiene entero en memoria;
 *   · calcula en paralelo los hashes de los trozos de un bloque;
 *   · avisa del avance, se puede cancelar entre bloques y cede el turno entre bloques si se lo piden (hilo principal).
 * Sin DOM ni red: sirve igual en un Worker (`preparacion-archivo.worker.ts`) y en el hilo principal. Nunca lanza
 * por culpa del archivo: un fallo de lectura/WebCrypto es un `null` con motivo.
 */

/** Bytes que se leen de una vez (se redondea a trozos enteros). */
export const BLOQUE_PREPARACION_BYTES = 4 * 1024 * 1024;

export interface OpcionesHashPorBloques {
  /** 0..100 tras cada bloque. */
  alProgreso?: (pct: number) => void;
  /** true = abandonar (se comprueba antes de cada bloque). */
  cancelado?: () => boolean;
  /** Cede el turno entre bloques (en el hilo principal: `setTimeout 0`). */
  ceder?: () => Promise<void>;
  bloqueBytes?: number;
}

export type ResultadoHash = { ok: true; raiz: string } | { ok: false; cancelado: boolean; motivo: string };

function aHex(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += u[i].toString(16).padStart(2, "0");
  return s;
}

/** Hash de cada trozo y raíz. `tamTrozo` y `trozos` son los de la oferta (la raíz depende de ellos). */
export async function hashearPorBloques(archivo: Blob, tamTrozo: number, trozos: number, opts: OpcionesHashPorBloques = {}): Promise<ResultadoHash> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, cancelado: false, motivo: "este aparato no tiene WebCrypto" };
  if (!(tamTrozo > 0) || !(trozos >= 1)) return { ok: false, cancelado: false, motivo: "trozos imposibles" };
  const tamano = archivo.size;
  const porBloque = Math.max(1, Math.floor((opts.bloqueBytes ?? BLOQUE_PREPARACION_BYTES) / tamTrozo));
  const hashes = new Uint8Array(trozos * 32);
  try {
    for (let b = 0; b < trozos; b += porBloque) {
      if (opts.cancelado?.()) return { ok: false, cancelado: true, motivo: "cancelado" };
      const n = Math.min(porBloque, trozos - b);
      const buf = await archivo.slice(Math.min(tamano, b * tamTrozo), Math.min(tamano, (b + n) * tamTrozo)).arrayBuffer();
      const pendientes: Array<Promise<ArrayBuffer>> = [];
      for (let j = 0; j < n; j++) {
        const desde = Math.min(buf.byteLength, j * tamTrozo);
        const largo = Math.max(0, Math.min(tamTrozo, buf.byteLength - desde));
        pendientes.push(subtle.digest("SHA-256", new Uint8Array(buf, desde, largo)));
      }
      const hechos = await Promise.all(pendientes);
      for (let j = 0; j < n; j++) hashes.set(new Uint8Array(hechos[j]), (b + j) * 32);
      try {
        opts.alProgreso?.(Math.min(100, Math.round(((b + n) / trozos) * 100)));
      } catch {
        /* informativo */
      }
      if (opts.ceder) await opts.ceder();
    }
    if (opts.cancelado?.()) return { ok: false, cancelado: true, motivo: "cancelado" };
    return { ok: true, raiz: aHex(await subtle.digest("SHA-256", hashes)) };
  } catch (e) {
    return { ok: false, cancelado: false, motivo: e instanceof Error ? e.message || "error de lectura" : "error de lectura" };
  }
}
