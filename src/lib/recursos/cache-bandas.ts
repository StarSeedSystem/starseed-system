// Caché de bandas por medio (architecture/apps-en-la-malla.md §7): guarda bandas
// de 4 MiB verificadas por SHA-256 con presupuesto del medio (`perfil-medio.ts`)
// y expulsión de lo menos usado. Pura: el `Almacenamiento` (OPFS en el navegador,
// memoria en pruebas), el reloj y el `crypto.subtle` se inyectan.

import type { Almacenamiento } from "@/lib/astraura/capas/almacen";

/** Lo único que la caché usa de `crypto.subtle`. */
export interface Resumidor {
  digest(algoritmo: "SHA-256", datos: ArrayBuffer): Promise<ArrayBuffer>;
}

export interface OpcionesCacheBandas {
  almacen: Almacenamiento;
  /** Presupuesto del medio en bytes; la expulsión lo respeta salvo bandas en uso. */
  presupuestoBytes: number;
  ahora?: () => number;
  /** Resumidor inyectable; por defecto `globalThis.crypto.subtle`. */
  resumidor?: Resumidor;
}

export interface InfoBanda {
  sha256: string;
  bytes: number;
  ultimoUso: number;
  enUso: boolean;
}

export interface CacheBandas {
  tener(sha: string): Promise<boolean>;
  /** Devuelve la banda y la marca en uso hasta `soltar`; null si no está. */
  leer(sha: string): Promise<ArrayBuffer | null>;
  /** Libera la marca de uso (una sola marca por `leer`). */
  soltar(sha: string): void;
  /** Guarda tras verificar el SHA-256; false si no cuadra o el sha es inválido. */
  guardar(sha: string, bytes: ArrayBuffer): Promise<boolean>;
  estado(): Promise<{ bandas: InfoBanda[]; usadosBytes: number }>;
}

interface MetaBanda {
  bytes: number;
  ultimoUso: number;
  /** > 0 = en uso: jamás se expulsa (§7 «expulsión de lo menos usado»). */
  usos: number;
}

const esShaValido = (sha: string): boolean => /^[0-9a-f]{64}$/.test(sha);
const claveDe = (sha: string): string => `banda/${sha}`;

export function crearCacheBandas(o: OpcionesCacheBandas): CacheBandas {
  const resumidor: Resumidor = o.resumidor ?? globalThis.crypto.subtle;
  const ahora = o.ahora ?? (() => Date.now());
  const metas = new Map<string, MetaBanda>();

  const shaHex = async (datos: ArrayBuffer): Promise<string> => {
    const resumen = await resumidor.digest("SHA-256", datos);
    return [...new Uint8Array(resumen)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const estadoInterno = (): { bandas: InfoBanda[]; usadosBytes: number } => {
    const bandas = [...metas.entries()]
      .map(([sha, m]) => ({
        sha256: sha,
        bytes: m.bytes,
        ultimoUso: m.ultimoUso,
        enUso: m.usos > 0,
      }))
      .sort((a, b) => a.sha256.localeCompare(b.sha256));
    return { bandas, usadosBytes: bandas.reduce((s, b) => s + b.bytes, 0) };
  };

  /** Expulsa por uso más antiguo (LRU) sin tocar bandas en uso ni `protegida`. */
  const hacerSitio = async (protegida: string): Promise<string[]> => {
    const expulsadas: string[] = [];
    let usados = estadoInterno().usadosBytes;
    if (usados <= o.presupuestoBytes) return expulsadas;
    const candidatas = [...metas.entries()]
      .filter(([s, m]) => s !== protegida && m.usos === 0)
      .sort(([, a], [, b]) => a.ultimoUso - b.ultimoUso);
    for (const [sha, m] of candidatas) {
      if (usados <= o.presupuestoBytes) break;
      await o.almacen.borrar(claveDe(sha));
      usados -= m.bytes;
      metas.delete(sha);
      expulsadas.push(sha);
    }
    return expulsadas;
  };

  const cache: CacheBandas = {
    tener: async (sha) => {
      if (!esShaValido(sha)) return false;
      if (metas.has(sha)) return true;
      // Reconcilia con el almacén (bandas de una sesión anterior del mismo medio).
      const datos = await o.almacen.leer(claveDe(sha));
      if (datos === null) return false;
      metas.set(sha, { bytes: datos.byteLength, ultimoUso: ahora(), usos: 0 });
      return true;
    },
    leer: async (sha) => {
      if (!(await cache.tener(sha))) return null;
      const datos = await o.almacen.leer(claveDe(sha));
      const meta = metas.get(sha);
      if (datos === null || !meta) {
        metas.delete(sha);
        return null;
      }
      meta.usos += 1;
      meta.ultimoUso = ahora();
      return datos;
    },
    soltar: (sha) => {
      const meta = metas.get(sha);
      if (meta && meta.usos > 0) meta.usos -= 1;
    },
    guardar: async (sha, bytes) => {
      if (!esShaValido(sha) || (await shaHex(bytes)) !== sha) return false;
      await o.almacen.escribir(claveDe(sha), bytes);
      metas.set(sha, { bytes: bytes.byteLength, ultimoUso: ahora(), usos: 0 });
      // La recién guardada queda protegida: no se expulsa por su propio guardado.
      await hacerSitio(sha);
      return true;
    },
    estado: async () => estadoInterno(),
  };
  return cache;
}

