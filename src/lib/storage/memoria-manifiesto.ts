/**
 * Manifiesto de las memorias de los cerebros por HUELLA DE CONTENIDO (INF1025H):
 * cuántas copias reales existen de cada memoria y dónde, cuál es su «última copia»,
 * dónde han divergido los destinos y qué limpiezas se PROPONEN (solo propuestas,
 * siempre confirmadas por personas). Huella: SHA-256 con Web Crypto
 * (`globalThis.crypto.subtle`); BLAKE3 —el algoritmo de Spacedrive— no está
 * disponible en el navegador sin dependencias: se deja dicho a propósito. Puro:
 * sin red, sin disco, sin reloj (entra por parámetro en `actualizadoMs`).
 */

export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";

/** Una copia real de una memoria en un destino. */
export interface CopiaMemoria { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; bytes: number; actualizadoMs: number | null }
/** Un contenido (huella) con todas sus copias: destinos, última copia y divergencia. */
export interface GrupoHuella { huella: string; copias: CopiaMemoria[]; destinos: DestinoMemoria[]; /** La más reciente; null en empate o sin ninguna fecha. */ ultimaCopia: CopiaMemoria | null; /** Participa en una divergencia (ver `divergencias`). */ divergente: boolean }
export interface ManifiestoMemoria { grupos: GrupoHuella[] }
/** Una memoria que ha divergido: distintas huellas en distintos destinos. */
export interface DivergenciaMemoria { cerebroId: string; memoriaId: string; huellas: string[]; copias: CopiaMemoria[]; ganadora: CopiaMemoria | null }
/** Propuesta de limpieza — SOLO propuesta: nunca quita nada sola. */
export interface PropuestaLimpieza { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; quedanEn: DestinoMemoria[]; motivo: string; requiereConfirmacion: true }

/** SHA-256 en hex, normalizando `\r\n` a `\n`: el salto de Windows no cambia la identidad. */
export async function huellaContenido(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto.replace(/\r\n/g, "\n"));
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(resumen)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ORDEN_DESTINOS: readonly DestinoMemoria[] = ["local", "starseed", "gdrive", "p2p", "externo"];
const comparar = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const claveDe = (c: CopiaMemoria): string => `${c.cerebroId}|${c.memoriaId}`;
const ordenarDestinos = (d: DestinoMemoria[]): DestinoMemoria[] => d.sort((a, b) => ORDEN_DESTINOS.indexOf(a) - ORDEN_DESTINOS.indexOf(b));
const ordenCopias = (a: CopiaMemoria, b: CopiaMemoria): number => comparar(a.cerebroId, b.cerebroId) || comparar(a.memoriaId, b.memoriaId) || comparar(a.destino, b.destino) || a.bytes - b.bytes;

/** La copia más NUEVA gana (regla del OS); empate de fechas o todas sin fecha → null. */
function ultimaDe(copias: CopiaMemoria[]): CopiaMemoria | null {
  const conFecha = copias.filter((c) => c.actualizadoMs !== null);
  if (conFecha.length === 0) return null;
  const maximo = Math.max(...conFecha.map((c) => c.actualizadoMs as number));
  const ganadoras = conFecha.filter((c) => c.actualizadoMs === maximo);
  return ganadoras.length === 1 ? ganadoras[0] : null;
}

/** Agrupa por huella (el contenido manda), con orden determinista y última copia. */
export function construirManifiesto(copias: CopiaMemoria[]): ManifiestoMemoria {
  const porHuella = new Map<string, CopiaMemoria[]>();
  const huellasPorMemoria = new Map<string, Set<string>>();
  for (const copia of copias) {
    porHuella.set(copia.huella, [...(porHuella.get(copia.huella) ?? []), copia]);
    huellasPorMemoria.set(claveDe(copia), (huellasPorMemoria.get(claveDe(copia)) ?? new Set<string>()).add(copia.huella));
  }
  const grupos = [...porHuella.entries()].map(([huella, sinOrden]): GrupoHuella => {
    const delGrupo = sinOrden.slice().sort(ordenCopias);
    return {
      huella,
      copias: delGrupo,
      destinos: ordenarDestinos([...new Set(delGrupo.map((c) => c.destino))]),
      ultimaCopia: ultimaDe(delGrupo),
      divergente: delGrupo.some((c) => (huellasPorMemoria.get(claveDe(c))?.size ?? 1) > 1),
    };
  });
  return { grupos: grupos.sort((a, b) => comparar(a.huella, b.huella)) };
}

function copiasPorMemoria(m: ManifiestoMemoria): Map<string, CopiaMemoria[]> {
  const porMemoria = new Map<string, CopiaMemoria[]>();
  for (const grupo of m.grupos)
    for (const copia of grupo.copias)
      porMemoria.set(claveDe(copia), [...(porMemoria.get(claveDe(copia)) ?? []), copia]);
  return porMemoria;
}

/** Memorias con huellas DISTINTAS en destinos DISTINTOS. Orden determinista. */
export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  const resultado: DivergenciaMemoria[] = [];
  for (const copias of copiasPorMemoria(m).values()) {
    const huellas = [...new Set(copias.map((c) => c.huella))].sort(comparar);
    if (huellas.length < 2 || new Set(copias.map((c) => c.destino)).size < 2) continue;
    const ordenadas = copias.slice().sort(ordenCopias);
    resultado.push({ cerebroId: ordenadas[0].cerebroId, memoriaId: ordenadas[0].memoriaId, huellas, copias: ordenadas, ganadora: ultimaDe(ordenadas) });
  }
  return resultado.sort((a, b) => comparar(a.cerebroId, b.cerebroId) || comparar(a.memoriaId, b.memoriaId));
}

/**
 * SOLO propone (`requiereConfirmacion: true` siempre); nunca ejecuta. Jamás
 * propone quitar una «última copia» ni la única copia del destino «local» de
 * una memoria, y solo habla de contenido REPETIDO de su misma huella — nunca
 * porque falte en otro destino («ningún borrado se propaga solo»).
 */
export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const localesDeMemoria = new Map<string, number>();
  for (const grupo of m.grupos)
    for (const copia of grupo.copias)
      if (copia.destino === "local")
        localesDeMemoria.set(claveDe(copia), (localesDeMemoria.get(claveDe(copia)) ?? 0) + 1);
  const propuestas: PropuestaLimpieza[] = [];
  for (const grupo of m.grupos) {
    if (grupo.copias.length < 2) continue;
    for (const copia of grupo.copias) {
      if (copia === grupo.ultimaCopia) continue;
      if (copia.destino === "local" && (localesDeMemoria.get(claveDe(copia)) ?? 0) <= 1) continue;
      const quedanEn = ordenarDestinos([...new Set(grupo.copias.filter((c) => c !== copia).map((c) => c.destino))]);
      propuestas.push({ cerebroId: copia.cerebroId, memoriaId: copia.memoriaId, destino: copia.destino, huella: grupo.huella, quedanEn, motivo: `Queda otra copia idéntica en ${quedanEn.join(", ")}: quitar esta no deja la memoria sin copia.`, requiereConfirmacion: true });
    }
  }
  return propuestas.sort(
    (a, b) => comparar(a.cerebroId, b.cerebroId) || comparar(a.memoriaId, b.memoriaId) || comparar(a.destino, b.destino),
  );
}

/** «12 memorias, 3 con copia única, 1 divergente» — en español, para personas. */
export function resumenManifiesto(m: ManifiestoMemoria): string {
  const conteo = new Map<string, number>();
  for (const copias of copiasPorMemoria(m).values()) conteo.set(copias[0].cerebroId + copias[0].memoriaId, copias.length);
  const unicas = [...conteo.values()].filter((n) => n === 1).length;
  const divergentes = divergencias(m).length;
  const contar = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;
  return `${contar(conteo.size, "memoria", "memorias")}, ${contar(unicas, "con copia única", "con copia única")}, ${contar(divergentes, "divergente", "divergentes")}`;
}
