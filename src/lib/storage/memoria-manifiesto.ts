// ═════════════════════════════════════════════════════════════════════
// StarSeed OS · Manifiesto de memorias por huella de contenido (INF1025H)
// ─────────────────────────────────────────────────────────────────────
// Spacedrive identifica cada archivo por el hash de su contenido (BLAKE3);
// aquí las copias de una memoria (local, StarSeed, Google Drive, P2P y
// externo) se agrupan por huella para saber cuántas copias reales hay,
// cuál es la última («el más nuevo gana», la misma regla del OS, ver
// `gdrive-brain-sync.ts`) y qué copias redundantes son limpiables —
// SIEMPRE como propuesta con confirmación humana: ningún borrado se
// propaga solo.
//
// ⚠️ BLAKE3 no está disponible en el navegador sin dependencias nativas:
// la huella usa SHA-256 con `globalThis.crypto.subtle` (Web Crypto);
// cambiar el algoritmo cambiaría TODAS las huellas, por eso se dice aquí.
//
// Módulo PURO: sin red, sin disco y sin reloj (el tiempo entra por
// parámetro en `actualizadoMs`). Nunca escribe ni borra nada.
// ═════════════════════════════════════════════════════════════════════

/** Destino donde vive una copia de una memoria de cerebro. */
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";

/** Una copia real de una memoria de un cerebro en un destino. */
export interface CopiaMemoria {
  cerebroId: string;
  memoriaId: string;
  destino: DestinoMemoria;
  huella: string; // SHA-256 hex del contenido normalizado (ver `huellaContenido`)
  bytes: number;
  actualizadoMs: number | null; // epoch ms; null si el destino no dio fecha
}

/** Copias con la MISMA huella. `ultimaCopia`: la más reciente (una sola, en un solo destino); null si hay empate o ninguna tiene fecha. */
export interface GrupoHuella {
  huella: string;
  copias: CopiaMemoria[];
  destinos: DestinoMemoria[];
  ultimaCopia: CopiaMemoria | null;
  divergente: boolean; // alguna memoria del grupo vive también con OTRA huella
}

/** Manifiesto completo: grupos por huella + contados para el resumen. */
export interface ManifiestoMemoria {
  grupos: GrupoHuella[];
  totalCopias: number;
  memorias: number;
  conCopiaUnica: number;
  divergentes: number;
}

/** Una huella concreta dentro de una divergencia. */
export interface HuellaDivergente {
  huella: string;
  destinos: DestinoMemoria[];
  copias: CopiaMemoria[];
}

/** Divergencia: la misma memoria con huellas distintas en destinos distintos. */
export interface DivergenciaMemoria {
  cerebroId: string;
  memoriaId: string;
  huellas: HuellaDivergente[];
  ganadora: CopiaMemoria | null; // la MÁS NUEVA; null en empate o sin fechas
}

/** Propuesta de limpieza: SOLO propuesta, SIEMPRE con confirmación humana. */
export interface PropuestaLimpieza {
  cerebroId: string;
  memoriaId: string;
  destino: DestinoMemoria;
  huella: string;
  bytes: number;
  motivo: string;
  requiereConfirmacion: true;
}

/** Huella de contenido: SHA-256 en hex con Web Crypto; normaliza `\r\n` a `\n` para que Windows y Unix den la MISMA huella. */
export async function huellaContenido(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto.replace(/\r\n/g, "\n"));
  const digesto = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(digesto)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const claveMemoria = (c: CopiaMemoria): string => `${c.cerebroId} ${c.memoriaId}`;

const comparar = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Orden determinista de copias: el mismo manojo en cualquier orden da el mismo manifiesto. */
function ordenarCopias(copias: CopiaMemoria[]): CopiaMemoria[] {
  return [...copias].sort(
    (a, b) =>
      comparar(a.destino, b.destino) ||
      comparar(a.cerebroId, b.cerebroId) ||
      comparar(a.memoriaId, b.memoriaId) ||
      a.bytes - b.bytes ||
      (a.actualizadoMs ?? -1) - (b.actualizadoMs ?? -1),
  );
}

function agruparPor<T, K extends string>(items: T[], clave: (i: T) => K): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const i of items) {
    const k = clave(i);
    const lista = mapa.get(k);
    if (lista) lista.push(i);
    else mapa.set(k, [i]);
  }
  return mapa;
}

/** La copia con fecha estrictamente máxima, SI es única; null en empate o si ninguna tiene fecha («el empate no escribe nada»). */
function laMasNueva(copias: CopiaMemoria[]): CopiaMemoria | null {
  const conFecha = copias.filter((c) => c.actualizadoMs != null);
  if (conFecha.length === 0) return null;
  const max = Math.max(...conFecha.map((c) => c.actualizadoMs as number));
  const ganadoras = conFecha.filter((c) => c.actualizadoMs === max);
  return ganadoras.length === 1 ? ganadoras[0] : null;
}

/** Agrupa las copias por huella (grupos ordenados por huella, copias ordenadas). */
export function construirManifiesto(copias: CopiaMemoria[]): ManifiestoMemoria {
  const ordenadas = ordenarCopias(copias);
  const porHuella = agruparPor(ordenadas, (c) => c.huella);
  const huellasPorMemoria = new Map<string, Set<string>>();
  for (const c of ordenadas) {
    const k = claveMemoria(c);
    const set = huellasPorMemoria.get(k) ?? new Set<string>();
    set.add(c.huella);
    huellasPorMemoria.set(k, set);
  }
  const grupos: GrupoHuella[] = [...porHuella.entries()]
    .sort(([a], [b]) => comparar(a, b))
    .map(([huella, grupo]) => ({
      huella,
      copias: grupo,
      destinos: [...new Set(grupo.map((c) => c.destino))].sort(),
      ultimaCopia: laMasNueva(grupo),
      divergente: grupo.some((c) => (huellasPorMemoria.get(claveMemoria(c))?.size ?? 0) > 1),
    }));
  const porMemoria = agruparPor(ordenadas, claveMemoria);
  return {
    grupos,
    totalCopias: ordenadas.length,
    memorias: porMemoria.size,
    conCopiaUnica: [...porMemoria.values()].filter((g) => g.length === 1).length,
    divergentes: [...huellasPorMemoria.values()].filter((s) => s.size > 1).length,
  };
}

/** Lista las memorias con huellas distintas entre destinos, con la ganadora si se puede decidir (gana la más nueva; el empate no escribe nada). */
export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  const todas = m.grupos.flatMap((g) => g.copias);
  const porMemoria = [...agruparPor(todas, claveMemoria).entries()].sort(([a], [b]) => comparar(a, b));
  const salida: DivergenciaMemoria[] = [];
  for (const [, copiasMemoria] of porMemoria) {
    if (new Set(copiasMemoria.map((c) => c.huella)).size < 2) continue;
    const porHuella = [...agruparPor(ordenarCopias(copiasMemoria), (c) => c.huella).entries()]
      .sort(([a], [b]) => comparar(a, b))
      .map(([huella, grupo]) => ({
        huella,
        destinos: [...new Set(grupo.map((c) => c.destino))].sort(),
        copias: grupo,
      }));
    salida.push({
      cerebroId: copiasMemoria[0].cerebroId,
      memoriaId: copiasMemoria[0].memoriaId,
      huellas: porHuella,
      ganadora: laMasNueva(copiasMemoria),
    });
  }
  return salida;
}

/**
 * Propuestas de limpieza de copias REDUNDANTES (misma huella en ≥ 2 copias de
 * la misma memoria). JAMÁS se propone quitar la copia más nueva (la «última
 * copia»), una copia sin fecha (no se puede saber si es la última) ni la
 * única copia de un destino `local`; y nunca se sugiere quitar de un destino
 * porque falte en otro: ningún borrado se propaga solo.
 */
export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const todas = m.grupos.flatMap((g) => g.copias);
  const porMemoria = [...agruparPor(todas, claveMemoria).entries()].sort(([a], [b]) => comparar(a, b));
  const propuestas: PropuestaLimpieza[] = [];
  for (const [, copiasMemoria] of porMemoria) {
    if (copiasMemoria.length < 2) continue;
    const maxFecha = Math.max(...copiasMemoria.map((c) => c.actualizadoMs ?? -Infinity));
    const locales = copiasMemoria.filter((c) => c.destino === "local").length;
    for (const [, grupo] of [...agruparPor(copiasMemoria, (c) => c.huella).entries()].sort(([a], [b]) => comparar(a, b))) {
      if (grupo.length < 2) continue;
      const destinosH = [...new Set(grupo.map((c) => c.destino))].sort().join(", ");
      for (const c of ordenarCopias(grupo)) {
        if (c.actualizadoMs == null) continue; // sin fecha: no se sabe si es la última
        if (c.actualizadoMs >= maxFecha) continue; // la última (o empatada en la cima): jamás
        if (c.destino === "local" && locales === 1) continue; // única copia local: jamás
        propuestas.push({
          cerebroId: c.cerebroId,
          memoriaId: c.memoriaId,
          destino: c.destino,
          huella: c.huella,
          bytes: c.bytes,
          motivo: `Hay ${grupo.length} copias idénticas de esta memoria en ${destinosH}; se conserva la más reciente y se propone retirar esta. Ningún borrado se propaga solo.`,
          requiereConfirmacion: true,
        });
      }
    }
  }
  return propuestas;
}

/** Resumen en español, p. ej. «12 memorias, 3 con copia única, 1 divergente». */
export function resumenManifiesto(m: ManifiestoMemoria): string {
  return `${m.memorias} ${m.memorias === 1 ? "memoria" : "memorias"}, ${m.conCopiaUnica} con copia única, ${m.divergentes} divergente${m.divergentes === 1 ? "" : "s"}`;
}
