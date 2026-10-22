// Caché de bandas por medio (architecture/apps-en-la-malla.md §7).
// E/S inyectada: almacén, reloj y `crypto.subtle`; sin globals ni disco real.
import type { Almacenamiento } from "@/lib/astraura/capas/almacen";
/** Parte de WebCrypto que hace falta, inyectable para pruebas y para OPFS. */
export interface SubtleBandas {
  digest(algoritmo: string, datos: ArrayBuffer): Promise<ArrayBuffer>;
}
export interface CryptoBandas { subtle: SubtleBandas }
export interface OpcionesCacheBandas {
  almacen: Almacenamiento;
  presupuestoBytes: number;
  ahora?: () => number;
  crypto?: CryptoBandas;
}
export type ResultadoGuardarBanda =
  | { ok: true; expulsadas: string[] }
  | { ok: false; motivo: "sha-invalido" | "sha-no-coincide" | "no-cabe" };
export interface CacheBandas {
  tener(sha256: string): Promise<boolean>;
  leer(sha256: string): Promise<ArrayBuffer | null>;
  guardar(sha256: string, bytes: ArrayBuffer): Promise<ResultadoGuardarBanda>;
  /** Fija una banda mientras la usa una app: la expulsión la respeta. */
  marcarEnUso(sha256: string): void;
  liberar(sha256: string): void;
}
interface UsoBanda { bytes: number; ultimoUso: number }
const DATO = "banda/";
// Una clave de uso guarda tamaño y último uso en el nombre: no hace falta
// abrir la banda entera para reconstruir el LRU al arrancar.
const USO = "banda-uso/";
const CLAVE_USO = /^banda-uso\/([0-9a-f]{64})\/(\d+)\/(\d+)$/;
const esSha = (sha: string): boolean => /^[0-9a-f]{64}$/.test(sha);
const claveDato = (sha: string): string => DATO + sha;
const claveUso = (sha: string, u: UsoBanda): string => `${USO}${sha}/${u.bytes}/${u.ultimoUso}`;
const hex = (d: ArrayBuffer): string =>
  [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
const aBytes = (t: string): ArrayBuffer => new TextEncoder().encode(t).buffer as ArrayBuffer;
async function shaHex(d: ArrayBuffer, c: CryptoBandas): Promise<string> {
  return hex(await c.subtle.digest("SHA-256", d));
}
export function crearCacheBandas(opciones: OpcionesCacheBandas): CacheBandas {
  const { almacen } = opciones;
  const presupuesto = Number.isFinite(opciones.presupuestoBytes)
    ? Math.max(0, Math.floor(opciones.presupuestoBytes))
    : 0;
  const ahora = opciones.ahora ?? (() => Date.now());
  const cripto: CryptoBandas = opciones.crypto ?? globalThis.crypto;
  const metas = new Map<string, UsoBanda>();
  const enUso = new Map<string, number>();
  const listo = (async () => {
    try {
      for (const clave of await almacen.claves()) {
        const m = CLAVE_USO.exec(clave);
        if (m) metas.set(m[1], { bytes: Number(m[2]), ultimoUso: Number(m[3]) });
      }
    } catch { /* caché ilegible: se empieza vacía */ }
  })();
  const tocar = async (sha: string, bytes: number): Promise<void> => {
    const anterior = metas.get(sha);
    const uso = { bytes, ultimoUso: ahora() };
    metas.set(sha, uso);
    try {
      await almacen.escribir(claveUso(sha, uso), new ArrayBuffer(0));
      if (anterior && claveUso(sha, anterior) !== claveUso(sha, uso)) {
        await almacen.borrar(claveUso(sha, anterior));
      }
    } catch { /* el uso ya está en memoria; se rehace al siguiente guardado */ }
  };
  const soltar = (sha: string): void => {
    const queda = (enUso.get(sha) ?? 0) - 1;
    if (queda > 0) enUso.set(sha, queda); else enUso.delete(sha);
  };

  const expulsar = async (protegidas: Set<string>): Promise<string[]> => {
    const expulsadas: string[] = [];
    let total = [...metas.values()].reduce((s, m) => s + m.bytes, 0);
    const candidatas = [...metas.entries()]
      .filter(([sha]) => !protegidas.has(sha) && !enUso.has(sha))
      .sort(([, a], [, b]) => a.ultimoUso - b.ultimoUso);
    for (const [sha, meta] of candidatas) {
      if (total <= presupuesto) break;
      await almacen.borrar(claveDato(sha));
      await almacen.borrar(claveUso(sha, meta));
      metas.delete(sha);
      total -= meta.bytes;
      expulsadas.push(sha);
    }
    return expulsadas;
  };

  return {
    tener: async (sha) => {
      if (!esSha(sha)) return false;
      await listo;
      return (await almacen.claves()).includes(claveDato(sha));
    },
    leer: async (sha) => {
      if (!esSha(sha)) return null;
      await listo;
      enUso.set(sha, (enUso.get(sha) ?? 0) + 1);
      try {
        const datos = await almacen.leer(claveDato(sha));
        if (!datos) { metas.delete(sha); return null; }
        await tocar(sha, datos.byteLength);
        return datos;
      } finally { soltar(sha); }
    },
    guardar: async (sha, bytes) => {
      if (!esSha(sha)) return { ok: false, motivo: "sha-invalido" };
      if (bytes.byteLength > presupuesto) return { ok: false, motivo: "no-cabe" };
      await listo;
      if ((await shaHex(bytes, cripto)) !== sha) return { ok: false, motivo: "sha-no-coincide" };
      await almacen.escribir(claveDato(sha), bytes);
      await tocar(sha, bytes.byteLength);
      return { ok: true, expulsadas: await expulsar(new Set([sha])) };
    },
    marcarEnUso: (sha) => void enUso.set(sha, (enUso.get(sha) ?? 0) + 1),
    liberar: soltar,
  };
}
