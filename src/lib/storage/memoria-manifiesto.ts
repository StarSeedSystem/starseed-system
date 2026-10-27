// src/lib/storage/memoria-manifiesto.ts
// Manifiesto de copias de memorias de cerebros (Ola 1025R · INF1025H).
// Spacedrive identifica por hash; aquí usamos SHA-256 con Web Crypto
// (`globalThis.crypto.subtle`) porque BLAKE3 no está en el navegador sin
// dependencias. Módulo PURO: sin red, disco ni reloj; las fechas llegan ya
// resueltas. Gana la copia más reciente, el empate no escribe nada y ningún
// borrado se propaga solo; la limpieza solo propone y siempre pide confirmación.
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";
export interface CopiaMemoria {
  cerebroId: string; memoriaId: string; destino: DestinoMemoria;
  huella: string; bytes: number; actualizadoMs: number | null;
}
export interface GrupoHuella {
  huella: string; copias: CopiaMemoria[]; destinos: DestinoMemoria[];
  ultimaCopia: boolean; // una sola copia en un solo destino.
  divergente: boolean; // huellas distintas en destinos distintos.
}
export interface ManifiestoMemoria { copias: CopiaMemoria[]; grupos: GrupoHuella[]; }
export interface Divergencia {
  cerebroId: string; memoriaId: string; huellas: string[]; destinos: DestinoMemoria[];
  masNueva: string | null; // null si hay empate o no hay fechas.
  empate: boolean;
}
export interface PropuestaLimpieza {
  cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string;
  copia: CopiaMemoria; motivo: string; requiereConfirmacion: true;
}
/** SHA-256 en hex del contenido, normalizando saltos Windows (\r\n) a \n. */
export async function huellaContenido(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto.replace(/\r\n/g, "\n"));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
const claveMemoria = (c: CopiaMemoria): string => `${c.cerebroId}\u0000${c.memoriaId}`;
const claveDestino = (c: CopiaMemoria): string => `${claveMemoria(c)}\u0000${c.destino}`;
const msDesc = (a: number | null, b: number | null): number =>
  (b ?? Number.NEGATIVE_INFINITY) - (a ?? Number.NEGATIVE_INFINITY);
function compararCopias(a: CopiaMemoria, b: CopiaMemoria): number {
  return a.huella.localeCompare(b.huella) || a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId) ||
    a.destino.localeCompare(b.destino) || msDesc(a.actualizadoMs, b.actualizadoMs) || a.bytes - b.bytes;
}
function agrupar(copias: readonly CopiaMemoria[], clave: (c: CopiaMemoria) => string): Map<string, CopiaMemoria[]> {
  const mapa = new Map<string, CopiaMemoria[]>();
  for (const c of copias) {
    const k = clave(c); const lista = mapa.get(k);
    if (lista) lista.push(c); else mapa.set(k, [c]);
  }
  return mapa;
}

function paresDivergentes(copias: readonly CopiaMemoria[]): Set<string> {
  const salida = new Set<string>();
  for (const [k, lista] of agrupar(copias, claveMemoria))
    if (new Set(lista.map((c) => c.huella)).size > 1 && new Set(lista.map((c) => c.destino)).size > 1) salida.add(k);
  return salida;
}

export function construirManifiesto(copias: readonly CopiaMemoria[]): ManifiestoMemoria {
  const ordenadas = [...copias].sort(compararCopias);
  const divergentes = paresDivergentes(ordenadas);
  const grupos = [...agrupar(ordenadas, (c) => c.huella).entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([huella, grupo]) => ({
      huella, copias: grupo, destinos: [...new Set(grupo.map((c) => c.destino))].sort(),
      ultimaCopia: grupo.length === 1, divergente: grupo.some((c) => divergentes.has(claveMemoria(c))),
    }));
  return { copias: ordenadas, grupos };
}

export function divergencias(m: ManifiestoMemoria): Divergencia[] {
  const salida: Divergencia[] = [];
  const memorias = [...agrupar(m.copias, claveMemoria).values()]
    .sort((a, b) => claveMemoria(a[0]).localeCompare(claveMemoria(b[0])));
  for (const lista of memorias) {
    const huellas = [...new Set(lista.map((c) => c.huella))].sort();
    const destinos = [...new Set(lista.map((c) => c.destino))].sort();
    if (huellas.length < 2 || destinos.length < 2) continue;
    const conFecha = lista.filter((c) => c.actualizadoMs !== null);
    const max = conFecha.length > 0 ? Math.max(...conFecha.map((c) => c.actualizadoMs as number)) : null;
    const enMax = max === null ? [] : [...new Set(conFecha.filter((c) => c.actualizadoMs === max).map((c) => c.huella))];
    salida.push({
      cerebroId: lista[0].cerebroId, memoriaId: lista[0].memoriaId, huellas, destinos,
      masNueva: enMax.length === 1 ? enMax[0] : null, empate: enMax.length > 1,
    });
  }
  return salida;
}

function compararPropuestas(a: PropuestaLimpieza, b: PropuestaLimpieza): number {
  return a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId) || a.destino.localeCompare(b.destino) ||
    a.huella.localeCompare(b.huella) || msDesc(a.copia.actualizadoMs, b.copia.actualizadoMs) || a.copia.bytes - b.copia.bytes;
}

export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const salida: PropuestaLimpieza[] = [];
  for (const grupo of m.grupos) {
    if (grupo.ultimaCopia) continue;
    for (const copias of agrupar(grupo.copias, claveDestino).values()) {
      if (copias.length < 2) continue;
      const orden = [...copias].sort((a, b) => msDesc(a.actualizadoMs, b.actualizadoMs) || compararCopias(a, b));
      for (const copia of orden.slice(1)) {
        if (copia.destino === "local" && copias.filter((c) => c.destino === "local").length < 2) continue;
        salida.push({
          cerebroId: copia.cerebroId, memoriaId: copia.memoriaId, destino: copia.destino, huella: copia.huella,
          copia, motivo: "Duplicado exacto de la misma huella en el mismo destino; queda otra copia.",
          requiereConfirmacion: true,
        });
      }
    }
  }
  return salida.sort(compararPropuestas);
}

export function resumenManifiesto(m: ManifiestoMemoria): string {
  const memorias = agrupar(m.copias, claveMemoria);
  const total = memorias.size;
  const unicas = [...memorias.values()].filter((lista) => lista.length === 1).length;
  const divergentes = divergencias(m).length;
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  return `${plural(total, "memoria", "memorias")}, ${unicas} con copia única, ${plural(divergentes, "divergente", "divergentes")}`;
}
