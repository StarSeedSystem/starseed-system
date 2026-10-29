// src/lib/storage/memoria-manifiesto.ts
// ─────────────────────────────────────────────────────────────────────────────
// Manifiesto de copias de las memorias de los cerebros (Ola 1025R · INF1025H).
//
// Responde a dos preguntas que el sync por fecha («el más nuevo gana») no sabe:
// cuántas copias REALES tiene cada memoria y si quitar una la dejaría sin copia.
// La huella usa SHA-256 con Web Crypto (`globalThis.crypto.subtle`) porque
// BLAKE3 —el hash que usa Spacedrive— no está en el navegador sin dependencias.
// Módulo PURO: sin red, disco ni reloj; las fechas llegan ya resueltas.
// Nada de esto borra: `proponerLimpieza` solo propone y siempre pide confirmación.
// ─────────────────────────────────────────────────────────────────────────────

export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";

export interface CopiaMemoria {
  cerebroId: string;
  memoriaId: string;
  destino: DestinoMemoria;
  huella: string;
  bytes: number;
  actualizadoMs: number | null;
}

export interface GrupoHuella {
  huella: string;
  copias: CopiaMemoria[];
  destinos: DestinoMemoria[];
  /** Una sola copia, de una sola memoria, en un solo destino. */
  ultimaCopia: boolean;
  /** Alguna memoria del grupo tiene otra copia con huella distinta. */
  divergente: boolean;
}

export interface ManifiestoMemoria {
  /** Grupos por huella de contenido, en orden determinista (huella ascendente). */
  grupos: GrupoHuella[];
}

export interface DivergenciaMemoria {
  cerebroId: string;
  memoriaId: string;
  /** Huellas distintas de la misma memoria, ordenadas. */
  huellas: string[];
  /** La copia más reciente; null si hay empate (no se escribe) o sin fechas. */
  masNueva: CopiaMemoria | null;
}

export interface PropuestaLimpieza {
  cerebroId: string;
  memoriaId: string;
  destino: DestinoMemoria;
  huella: string;
  motivo: string;
  /** Una propuesta nunca se ejecuta sola: siempre la confirma una persona. */
  requiereConfirmacion: true;
}

const ORDEN_DESTINOS: readonly DestinoMemoria[] = ["local", "starseed", "gdrive", "p2p", "externo"];

const prioridadDestino = (d: DestinoMemoria): number => ORDEN_DESTINOS.indexOf(d);
const claveMemoria = (c: Pick<CopiaMemoria, "cerebroId" | "memoriaId">): string =>
  `${c.cerebroId}\u0000${c.memoriaId}`;
const compararTexto = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function compararFecha(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compararCopias(a: CopiaMemoria, b: CopiaMemoria): number {
  return (
    compararTexto(a.cerebroId, b.cerebroId) ||
    compararTexto(a.memoriaId, b.memoriaId) ||
    prioridadDestino(a.destino) - prioridadDestino(b.destino) ||
    compararTexto(a.huella, b.huella) ||
    compararFecha(a.actualizadoMs, b.actualizadoMs)
  );
}

/**
 * Huella SHA-256 (hex) del contenido de una memoria. Normaliza `\r\n` a `\n`
 * para que el mismo texto guardado en Windows y en Linux dé la misma huella.
 * Usa `globalThis.crypto.subtle`: vale igual en navegador, en Node 20+ y en
 * cualquier trabajador del OS, sin abrir `node:crypto`.
 */
export async function huellaContenido(texto: string): Promise<string> {
  const normalizado = texto.replace(/\r\n/g, "\n");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizado),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Agrupa las copias por huella de contenido. Dentro de cada grupo las copias
 * quedan en orden determinista (cerebro, memoria, destino, huella, fecha) y
 * los grupos por huella ascendente, para que dos manifiestos iguales se
 * comparen sin depender del orden en que llegaron las copias.
 */
export function construirManifiesto(copias: readonly CopiaMemoria[]): ManifiestoMemoria {
  const conteo = new Map<string, number>();
  const huellas = new Map<string, Set<string>>();
  const porHuella = new Map<string, CopiaMemoria[]>();

  for (const copia of copias) {
    const clave = claveMemoria(copia);
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    const conjunto = huellas.get(clave) ?? new Set<string>();
    conjunto.add(copia.huella);
    huellas.set(clave, conjunto);
    const lista = porHuella.get(copia.huella) ?? [];
    lista.push(copia);
    porHuella.set(copia.huella, lista);
  }

  const grupos = Array.from(porHuella.entries())
    .sort(([a], [b]) => compararTexto(a, b))
    .map(([huella, lista]): GrupoHuella => {
      const ordenadas = [...lista].sort(compararCopias);
      const destinos = Array.from(new Set(ordenadas.map((c) => c.destino))).sort(
        (a, b) => prioridadDestino(a) - prioridadDestino(b),
      );
      const memorias = new Set(ordenadas.map(claveMemoria));
      const unica = ordenadas.length === 1 ? ordenadas[0] : undefined;
      const ultimaCopia =
        unica !== undefined && memorias.size === 1 && conteo.get(claveMemoria(unica)) === 1;
      const divergente = Array.from(memorias).some((k) => (huellas.get(k)?.size ?? 0) > 1);
      return { huella, copias: ordenadas, destinos, ultimaCopia, divergente };
    });

  return { grupos };
}

/** Copias del manifiesto agrupadas por memoria (cerebroId + memoriaId). */
function indices(m: ManifiestoMemoria): Map<string, CopiaMemoria[]> {
  const mapa = new Map<string, CopiaMemoria[]>();
  for (const grupo of m.grupos) {
    for (const copia of grupo.copias) {
      const clave = claveMemoria(copia);
      const lista = mapa.get(clave) ?? [];
      lista.push(copia);
      mapa.set(clave, lista);
    }
  }
  return mapa;
}

/**
 * Memorias con copias de contenido distinto. `masNueva` señala la copia que
 * gana con la regla del OS (la más reciente); si dos empatan en la fecha más
 * alta, queda en `null` porque un empate no escribe nada.
 */
export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  const salida: DivergenciaMemoria[] = [];

  for (const copias of indices(m).values()) {
    const huellas = Array.from(new Set(copias.map((c) => c.huella))).sort(compararTexto);
    if (huellas.length < 2) continue;
    salida.push({
      cerebroId: copias[0].cerebroId,
      memoriaId: copias[0].memoriaId,
      huellas,
      masNueva: masNuevaDe(copias),
    });
  }

  return salida.sort(
    (a, b) => compararTexto(a.cerebroId, b.cerebroId) || compararTexto(a.memoriaId, b.memoriaId),
  );
}

function masNuevaDe(copias: readonly CopiaMemoria[]): CopiaMemoria | null {
  let tope: number | null = null;
  for (const copia of copias) {
    if (copia.actualizadoMs !== null && (tope === null || copia.actualizadoMs > tope)) {
      tope = copia.actualizadoMs;
    }
  }
  if (tope === null) return null;
  const empatadas = copias.filter((c) => c.actualizadoMs === tope);
  return empatadas.length === 1 ? empatadas[0] : null;
}

/**
 * Propuestas de limpieza: SOLO copias duplicadas (misma huella) que sobran
 * porque el mismo contenido ya está en otra copia. Nunca toca una memoria con
 * una sola copia (`ultimaCopia`), nunca quita una copia `local` y no propone
 * borrar por ausencia en otro destino: ningún borrado se propaga solo.
 */
export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const propuestas: PropuestaLimpieza[] = [];

  for (const copias of indices(m).values()) {
    // Una sola copia = última copia de la memoria: jamás se propone tocarla.
    if (copias.length <= 1) continue;

    const porHuella = new Map<string, CopiaMemoria[]>();
    for (const copia of copias) {
      const lista = porHuella.get(copia.huella) ?? [];
      lista.push(copia);
      porHuella.set(copia.huella, lista);
    }

    for (const [huella, mismas] of porHuella) {
      if (mismas.length <= 1) continue;
      // Se conserva la copia local más reciente (el original de la persona);
      // si no hay local, la más reciente. El resto del mismo contenido sobra.
      const locales = mismas.filter((c) => c.destino === "local");
      const candidatas = (locales.length > 0 ? locales : mismas).slice();
      candidatas.sort(
        (a, b) =>
          compararFecha(b.actualizadoMs, a.actualizadoMs) ||
          prioridadDestino(a.destino) - prioridadDestino(b.destino),
      );
      const conservar = candidatas[0];

      for (const copia of mismas) {
        if (copia.destino === "local" || copia === conservar) continue;
        propuestas.push({
          cerebroId: copia.cerebroId,
          memoriaId: copia.memoriaId,
          destino: copia.destino,
          huella,
          motivo:
            "Copia duplicada: el mismo contenido ya existe en otra copia; quitarla no deja la memoria sin copia.",
          requiereConfirmacion: true,
        });
      }
    }
  }

  return propuestas.sort(
    (a, b) =>
      compararTexto(a.cerebroId, b.cerebroId) ||
      compararTexto(a.memoriaId, b.memoriaId) ||
      prioridadDestino(a.destino) - prioridadDestino(b.destino) ||
      compararTexto(a.huella, b.huella),
  );
}

/** Resumen legible para Genesis, en español: «12 memorias, 3 con copia única, 1 divergente». */
export function resumenManifiesto(m: ManifiestoMemoria): string {
  const copias = indices(m);
  let unicas = 0;
  let divergentes = 0;

  for (const lista of copias.values()) {
    if (lista.length === 1) unicas++;
    if (new Set(lista.map((c) => c.huella)).size > 1) divergentes++;
  }

  const plural = (n: number, uno: string, muchos: string) => `${n} ${n === 1 ? uno : muchos}`;
  return `${plural(copias.size, "memoria", "memorias")}, ${unicas} con copia única, ${plural(
    divergentes,
    "divergente",
    "divergentes",
  )}`;
}
