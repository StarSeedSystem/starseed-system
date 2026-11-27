/**
 * Almacenes — Bloques direccionados por hash, reanudación y versiones (módulo puro).
 * El hash se inyecta: en la neurona va SHA-256 (WebCrypto); aquí hay uno rápido por defecto.
 */

export type FuncionHash = (datos: Uint8Array) => string;

export interface BloqueRef {
  id: string;
  tam: number;
}

/** Hash no criptográfico de 53 bits (cyrb53) para pruebas y huellas rápidas. */
export const hashRapido: FuncionHash = (datos) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const b of datos) {
    h1 = Math.imul(h1 ^ b, 2654435761);
    h2 = Math.imul(h2 ^ b, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
};

/** Parte un archivo en bloques de tamaño fijo; el id de cada uno es su hash. */
export function dividirEnBloques(
  datos: Uint8Array,
  tamBloque: number,
  hash: FuncionHash = hashRapido,
): BloqueRef[] {
  if (!Number.isInteger(tamBloque) || tamBloque <= 0) throw new Error("tamBloque inválido");
  const salida: BloqueRef[] = [];
  for (let i = 0; i < datos.length; i += tamBloque) {
    const trozo = datos.subarray(i, i + tamBloque);
    salida.push({ id: hash(trozo), tam: trozo.length });
  }
  return salida;
}

/** Ids únicos que el destino aún no tiene (los bloques repetidos se envían una sola vez). */
export function bloquesFaltantes(deseados: BloqueRef[], tiene: ReadonlySet<string>): BloqueRef[] {
  const vistos = new Set<string>();
  return deseados.filter((b) => {
    if (tiene.has(b.id) || vistos.has(b.id)) return false;
    vistos.add(b.id);
    return true;
  });
}

export interface Transferencia {
  ruta: string;
  hash: string;
  bloques: BloqueRef[];
  recibidos: string[];
}

export function iniciarTransferencia(ruta: string, hash: string, bloques: BloqueRef[]): Transferencia {
  return { ruta, hash, bloques, recibidos: [] };
}

export function marcarRecibido(t: Transferencia, id: string): Transferencia {
  if (!t.bloques.some((b) => b.id === id) || t.recibidos.includes(id)) return t;
  return { ...t, recibidos: [...t.recibidos, id] };
}

/**
 * Reanudación: si el archivo cambió desde el corte (otro hash), se empieza de cero;
 * si no, solo faltan los bloques no recibidos.
 */
export function reanudar(t: Transferencia, hashActual: string, bloquesActuales: BloqueRef[]): Transferencia {
  if (hashActual !== t.hash) return iniciarTransferencia(t.ruta, hashActual, bloquesActuales);
  return t;
}

export function pendientes(t: Transferencia): BloqueRef[] {
  return bloquesFaltantes(t.bloques, new Set(t.recibidos));
}

export function estaCompleta(t: Transferencia): boolean {
  return pendientes(t).length === 0;
}

export interface Version {
  hash: string;
  tam: number;
  fecha: number;
}

/** Respaldo vivo: añade una versión nueva (nunca reemplaza); misma huella seguida no se repite. */
export function registrarVersion(historial: Version[], v: Version): Version[] {
  const ultima = historial[historial.length - 1];
  if (ultima && ultima.hash === v.hash) return historial;
  return [...historial, v];
}

/**
 * Versiones que sobrepasan el tope (las más viejas). Solo es una PROPUESTA:
 * borrarlas exige confirmación local del dueño.
 */
export function versionesAPodar(historial: Version[], maximo: number): Version[] {
  const sobran = historial.length - Math.max(1, maximo);
  return sobran > 0 ? historial.slice(0, sobran) : [];
}
