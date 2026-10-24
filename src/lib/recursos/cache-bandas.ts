// Caché de bandas por medio (architecture/apps-en-la-malla.md §7 · tarea I).
// Pura: el `Almacenamiento` de capas/almacen.ts va inyectado (OPFS en el navegador;
// `almacenamientoEnMemoria()` en pruebas), el reloj y el digesto SHA-256 también.
// El presupuesto viene de astraura/capas/perfil-medio.ts; aquí solo se respeta.

import type { Almacenamiento } from "@/lib/astraura/capas/almacen";

export interface OpcionesCacheBandas {
  almacen: Almacenamiento;
  /** Presupuesto del medio en bytes (perfil-medio.ts disco/da cuota). */
  presupuestoBytes: number;
  /** Reloj inyectable: ordena la expulsión de lo menos usado. */
  ahora?: () => number;
  /** Digesto SHA-256 inyectable en hex minúsculas; por defecto `crypto.subtle`. */
  resumen?: (datos: ArrayBuffer) => Promise<string>;
}

export interface MetaBanda {
  sha256: string;
  bytes: number;
  ultimoUso: number;
  /** En uso: la expulsión jamás la toca. */
  enUso: boolean;
}

export interface CacheBandas {
  tener(sha: string): Promise<boolean>;
  leer(sha: string): Promise<ArrayBuffer | null>;
  /** Guarda solo si el SHA-256 calculado coincide. Devuelve false si no cuadra. */
  guardar(sha: string, datos: ArrayBuffer): Promise<boolean>;
  /** Marca una banda «en uso» (fijada): la expulsión nunca la expulsa. */
  fijar(sha: string, si: boolean): Promise<boolean>;
  bytesUsados(): number;
}

export const claveBanda = (sha: string): string => `banda/${sha}`;

export const esShaValido = (sha: string): boolean => /^[0-9a-f]{64}$/.test(sha);

/** Digesto por defecto con `crypto.subtle`; `null` si el medio no lo ofrece. */
export async function sha256Hex(datos: ArrayBuffer): Promise<string | null> {
  const sutil = globalThis.crypto?.subtle;
  if (!sutil) return null;
  try {
    const resumen = await sutil.digest("SHA-256", datos);
    return [...new Uint8Array(resumen)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * Caché de bandas verificadas sobre cualquier `Almacenamiento` (§7):
 * guarda solo bandas cuyo SHA-256 coincide con su clave, expulsa lo menos
 * usado (LRU) al pasarse del presupuesto y nunca toca una banda en uso.
 */
export function crearCacheBandas(opciones: OpcionesCacheBandas): CacheBandas {
  const ahora = opciones.ahora ?? (() => Date.now());
  const resumen = opciones.resumen ?? sha256Hex;
  const presupuesto = opciones.presupuestoBytes;
  const almacen = opciones.almacen;
  const metas = new Map<string, MetaBanda>();

  const usados = (): number => [...metas.values()].reduce((s, m) => s + m.bytes, 0);

  /** Expulsa lo menos usado (excluyendo lo en uso) hasta caber en el presupuesto. */
  const hacerSitio = async (): Promise<string[]> => {
    const expulsadas: string[] = [];
    let total = usados();
    if (total <= presupuesto) return expulsadas;
    const candidatas = [...metas.entries()]
      .filter(([, m]) => !m.enUso)
      .sort(([, a], [, b]) => a.ultimoUso - b.ultimoUso);
    for (const [sha, meta] of candidatas) {
      if (total <= presupuesto) break;
      await almacen.borrar(claveBanda(sha));
      metas.delete(sha);
      total -= meta.bytes;
      expulsadas.push(sha);
    }
    return expulsadas;
  };

  return {
    async tener(sha) {
      return metas.has(sha);
    },

    async leer(sha) {
      const meta = metas.get(sha);
      if (!meta) return null;
      const datos = await almacen.leer(claveBanda(sha));
      if (datos === null) {
        metas.delete(sha);
        return null;
      }
      meta.ultimoUso = ahora();
      return datos;
    },

    async fijar(sha, si) {
      const meta = metas.get(sha);
      if (!meta) return false;
      meta.enUso = si;
      return true;
    },

    bytesUsados: usados,

    async guardar(sha, datos) {
      if (!esShaValido(sha)) return false;
      const real = await resumen(datos);
      if (real === null || real !== sha) return false;
      const ya = metas.get(sha);
      await almacen.escribir(claveBanda(sha), datos);
      metas.set(sha, {
        sha256: sha,
        bytes: datos.byteLength,
        ultimoUso: ahora(),
        enUso: ya?.enUso ?? false,
      });
      await hacerSitio();
      return true;
    },
  };
}
