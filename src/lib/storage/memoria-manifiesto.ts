/**
 * Manifiesto de copias de memorias de cerebros (Ola 1025R · INF1025H).
 * Huella SHA-256 con `globalThis.crypto.subtle`: BLAKE3 (Spacedrive) no está
 * en el navegador sin dependencias. Módulo PURO: sin red, disco ni reloj; las
 * fechas entran en `actualizadoMs`. Regla del OS: «el más nuevo gana» y
 * ningún borrado se propaga solo; aquí solo se describe y se propone.
 */
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";
export interface CopiaMemoria { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; bytes: number; actualizadoMs: number | null; }
export interface GrupoHuella { huella: string; copias: CopiaMemoria[]; destinos: DestinoMemoria[]; ultimaCopia: CopiaMemoria | null; divergente: boolean; }
export interface ManifiestoMemoria { grupos: GrupoHuella[]; memorias: number; copias: number; }
export interface DivergenciaMemoria { cerebroId: string; memoriaId: string; huellas: string[]; destinos: DestinoMemoria[]; ganadora: CopiaMemoria | null; empate: boolean; }
export interface PropuestaLimpieza { huella: string; cerebroId: string; memoriaId: string; destino: DestinoMemoria; copia: CopiaMemoria; conservar: CopiaMemoria; motivo: string; requiereConfirmacion: true; }
const ORDEN_DESTINOS: readonly DestinoMemoria[] = ["local", "starseed", "gdrive", "p2p", "externo"];

/** SHA-256 en hex; normaliza CRLF a LF antes de medir. */
export async function huellaContenido(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto.replace(/\r\n/g, "\n"));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function clave(c: CopiaMemoria): string { return `${c.cerebroId}\u0000${c.memoriaId}`; }

function compararCopias(a: CopiaMemoria, b: CopiaMemoria): number {
  return ORDEN_DESTINOS.indexOf(a.destino) - ORDEN_DESTINOS.indexOf(b.destino)
    || a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId)
    || (a.actualizadoMs ?? -1) - (b.actualizadoMs ?? -1) || a.bytes - b.bytes
    || a.huella.localeCompare(b.huella);
}

/** Agrupa por huella y marca las memorias que divergen entre destinos. */
export function construirManifiesto(copias: readonly CopiaMemoria[]): ManifiestoMemoria {
  const porHuella = new Map<string, CopiaMemoria[]>();
  const huellasPorMemoria = new Map<string, Set<string>>();
  const memorias = new Set<string>();
  for (const c of copias) {
    const lista = porHuella.get(c.huella) ?? [];
    lista.push({ ...c });
    porHuella.set(c.huella, lista);
    const k = clave(c);
    memorias.add(k);
    const hs = huellasPorMemoria.get(k) ?? new Set<string>();
    hs.add(c.huella);
    huellasPorMemoria.set(k, hs);
  }
  const grupos = Array.from(porHuella.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([huella, lista]): GrupoHuella => {
      const ordenadas = lista.sort(compararCopias);
      return {
        huella, copias: ordenadas,
        destinos: ORDEN_DESTINOS.filter((d) => ordenadas.some((c) => c.destino === d)),
        ultimaCopia: ordenadas.length === 1 ? ordenadas[0] : null,
        divergente: ordenadas.some((c) => (huellasPorMemoria.get(clave(c))?.size ?? 0) > 1),
      };
    });
  return { grupos, memorias: memorias.size, copias: copias.length };
}

/** Memorias con huellas distintas en destinos distintos. */
export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  const porMemoria = new Map<string, CopiaMemoria[]>();
  for (const g of m.grupos) for (const c of g.copias) {
    const lista = porMemoria.get(clave(c)) ?? [];
    lista.push(c);
    porMemoria.set(clave(c), lista);
  }
  const salida: DivergenciaMemoria[] = [];
  for (const [k, lista] of Array.from(porMemoria.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const huellas = Array.from(new Set(lista.map((c) => c.huella))).sort();
    const destinos = ORDEN_DESTINOS.filter((d) => lista.some((c) => c.destino === d));
    if (huellas.length < 2 || destinos.length < 2) continue;
    const conFecha = lista.filter((c) => c.actualizadoMs !== null);
    const max = Math.max(...conFecha.map((c) => c.actualizadoMs as number), Number.NEGATIVE_INFINITY);
    const nuevas = conFecha.filter((c) => c.actualizadoMs === max);
    const ganadora = nuevas.length === 1 ? nuevas[0] : null;
    const [cerebroId = "", memoriaId = ""] = k.split("\u0000");
    salida.push({ cerebroId, memoriaId, huellas, destinos, ganadora, empate: ganadora === null });
  }
  return salida;
}

/** Propuestas de limpieza: solo duplicados redundantes, siempre a confirmar. */
export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const propuestas: PropuestaLimpieza[] = [];
  for (const g of m.grupos) {
    if (g.copias.length <= 1) continue; // última copia: nunca se toca
    for (const destino of g.destinos) {
      const enDestino = g.copias.filter((c) => c.destino === destino).sort(compararCopias);
      if (enDestino.length <= 1) continue; // única copia del destino: protegida
      const conservar = enDestino.reduce((mejor, c) => (c.actualizadoMs ?? -1) > (mejor.actualizadoMs ?? -1) ? c : mejor);
      for (const copia of enDestino) {
        if (copia === conservar) continue;
        propuestas.push({ huella: g.huella, cerebroId: copia.cerebroId, memoriaId: copia.memoriaId, destino, copia, conservar, requiereConfirmacion: true, motivo: `Copia redundante de la misma memoria en «${destino}»; se conserva otra con la misma huella.` });
      }
    }
  }
  return propuestas.sort((a, b) => compararCopias(a.copia, b.copia));
}

/** Resumen legible: «12 memorias, 3 con copia única, 1 divergente». */
export function resumenManifiesto(m: ManifiestoMemoria): string {
  const porMemoria = new Map<string, number>();
  for (const g of m.grupos) for (const c of g.copias) {
    porMemoria.set(clave(c), (porMemoria.get(clave(c)) ?? 0) + 1);
  }
  const unicas = Array.from(porMemoria.values()).filter((n) => n === 1).length;
  const div = divergencias(m).length;
  return `${m.memorias} ${m.memorias === 1 ? "memoria" : "memorias"}, `
    + `${unicas} con copia única, ${div} ${div === 1 ? "divergente" : "divergentes"}`;
}
