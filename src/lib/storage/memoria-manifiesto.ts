// src/lib/storage/memoria-manifiesto.ts
// Manifiesto PURO de copias de memorias de cerebros: sin red, disco ni reloj.
// SHA-256 de Web Crypto (BLAKE3 —el de Spacedrive— no está sin dependencias).
// Regla del OS: gana la copia más reciente; un empate no escribe nada; nada
// se borra solo: toda limpieza es una propuesta con confirmación humana.
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";
export interface CopiaMemoria {
  cerebroId: string; memoriaId: string; destino: DestinoMemoria;
  huella: string; bytes: number; actualizadoMs: number | null;
}
export interface GrupoHuella {
  huella: string; copias: CopiaMemoria[]; destinos: DestinoMemoria[];
  ultimaCopia: boolean; divergente: boolean;
}
export interface ManifiestoMemoria { grupos: GrupoHuella[] }
export interface DivergenciaMemoria {
  cerebroId: string; memoriaId: string; huellas: string[];
  masNueva: CopiaMemoria | null; empate: boolean;
}
export interface PropuestaLimpieza {
  cerebroId: string; memoriaId: string; destino: DestinoMemoria;
  huella: string; motivo: string; requiereConfirmacion: true;
}
const ORDEN_DESTINOS = ["local", "starseed", "gdrive", "p2p", "externo"] as const;
const ordenDestino = (d: DestinoMemoria) => ORDEN_DESTINOS.indexOf(d);
const claveMemoria = (c: CopiaMemoria) => `${c.cerebroId}\u0000${c.memoriaId}`;
function agrupar<T>(items: readonly T[], clave: (t: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const lista = mapa.get(clave(item));
    if (lista) lista.push(item); else mapa.set(clave(item), [item]);
  }
  return mapa;
}
function contarPorMemoria(copias: readonly CopiaMemoria[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const c of copias) total.set(claveMemoria(c), (total.get(claveMemoria(c)) ?? 0) + 1);
  return total;
}
function compararCopias(a: CopiaMemoria, b: CopiaMemoria): number {
  return a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId) ||
    ordenDestino(a.destino) - ordenDestino(b.destino) || a.huella.localeCompare(b.huella) ||
    Number(a.actualizadoMs === null) - Number(b.actualizadoMs === null) ||
    (a.actualizadoMs ?? 0) - (b.actualizadoMs ?? 0) || a.bytes - b.bytes;
}
function compararRecientes(a: CopiaMemoria, b: CopiaMemoria): number {
  if (a.actualizadoMs === null || b.actualizadoMs === null) {
    if (a.actualizadoMs !== b.actualizadoMs) return a.actualizadoMs === null ? 1 : -1;
  } else if (a.actualizadoMs !== b.actualizadoMs) return b.actualizadoMs - a.actualizadoMs;
  return compararCopias(a, b);
}
/** SHA-256 en hex; normaliza CRLF a LF para que el mismo texto dé la misma huella. */
export async function huellaContenido(texto: string): Promise<string> {
  const datos = new TextEncoder().encode((texto ?? "").replace(/\r\n/g, "\n"));
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(resumen)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Agrupa por huella; una sola copia es «última copia». */
export function construirManifiesto(copias: readonly CopiaMemoria[]): ManifiestoMemoria {
  const huellasPorMemoria = agrupar(copias, claveMemoria);
  const grupos: GrupoHuella[] = [];
  for (const lista of agrupar(copias, (c) => c.huella).values()) {
    const ordenadas = [...lista].sort(compararCopias);
    const destinos = Array.from(new Set(ordenadas.map((c) => c.destino))).sort((a, b) => ordenDestino(a) - ordenDestino(b));
    const divergente = ordenadas.some((c) => (huellasPorMemoria.get(claveMemoria(c))?.length ?? 0) > 1);
    grupos.push({ huella: ordenadas[0].huella, copias: ordenadas, destinos, ultimaCopia: ordenadas.length === 1, divergente });
  }
  grupos.sort((a, b) => a.huella.localeCompare(b.huella));
  return { grupos };
}
/** Memorias con más de una huella distinta; dice cuál gana (empate = ninguna). */
export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  const copias = m.grupos.flatMap((g) => g.copias);
  const resultado: DivergenciaMemoria[] = [];
  for (const lista of agrupar(copias, claveMemoria).values()) {
    const huellas = Array.from(new Set(lista.map((c) => c.huella))).sort();
    if (huellas.length < 2) continue;
    const conFecha = lista.filter((c) => c.actualizadoMs !== null);
    const maxMs = conFecha.length ? Math.max(...conFecha.map((c) => c.actualizadoMs as number)) : null;
    const punteras = maxMs === null ? [] : conFecha.filter((c) => c.actualizadoMs === maxMs);
    const empate = new Set(punteras.map((c) => c.huella)).size !== 1;
    const masNueva = empate ? null : ([...punteras].sort(compararCopias)[0] ?? null);
    const [cerebroId, memoriaId] = claveMemoria(lista[0]).split("\u0000");
    resultado.push({ cerebroId, memoriaId, huellas, masNueva, empate });
  }
  return resultado.sort((a, b) => a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId));
}
/** Solo propone quitar duplicados exactos EN EL MISMO destino; nunca una última copia. */
export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const copias = m.grupos.flatMap((g) => g.copias);
  const totalPorMemoria = contarPorMemoria(copias);
  const propuestas: PropuestaLimpieza[] = [];
  const duplicados = agrupar(copias, (c) => `${claveMemoria(c)}\u0000${c.destino}\u0000${c.huella}`);
  for (const lista of duplicados.values()) {
    if (lista.length < 2 || (totalPorMemoria.get(claveMemoria(lista[0])) ?? 0) < 2) continue;
    const [conservada, ...sobrantes] = [...lista].sort(compararRecientes);
    for (const copia of sobrantes) propuestas.push({
      cerebroId: copia.cerebroId, memoriaId: copia.memoriaId, destino: copia.destino,
      huella: copia.huella, requiereConfirmacion: true,
      motivo: `Copia repetida del mismo contenido en «${copia.destino}»: se conserva la más reciente (${conservada.bytes} bytes).`,
    });
  }
  return propuestas.sort((a, b) => a.cerebroId.localeCompare(b.cerebroId) ||
    a.memoriaId.localeCompare(b.memoriaId) ||
    ordenDestino(a.destino) - ordenDestino(b.destino) || a.huella.localeCompare(b.huella));
}
/** Resumen para personas: «12 memorias, 3 con copia única, 1 divergente». */
export function resumenManifiesto(m: ManifiestoMemoria): string {
  const porMemoria = contarPorMemoria(m.grupos.flatMap((g) => g.copias));
  let unicas = 0;
  for (const total of porMemoria.values()) if (total === 1) unicas++;
  const memorias = porMemoria.size;
  const divergentes = divergencias(m).length;
  return `${memorias} ${memorias === 1 ? "memoria" : "memorias"}, ` +
    `${unicas} con copia única, ${divergentes} ${divergentes === 1 ? "divergente" : "divergentes"}`;
}
