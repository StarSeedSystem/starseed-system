/**
 * Manifiesto de copias de las memorias de los cerebros (Ola 1025R · INF1025H).
 * Spacedrive sabe cuántas copias reales hay por hash de contenido; el sync de
 * memorias (`gdrive-brain-sync.ts`) hoy compara solo fechas («el más nuevo gana»).
 * Este módulo PURO agrupa las copias por huella, señala la última y las divergencias
 * (mismo cerebroId+memoriaId con huellas distintas), y SOLO propone limpiar lo que
 * sobra: nunca borra, SIEMPRE pide confirmación, jamás para una «última copia» ni
 * para la única de `local`; ni sugiere quitar de un destino por faltar en otro
 * (ningún borrado se propaga solo); un empate no escribe nada. Orden determinista
 * en grupos/copias/destinos; sin `Date.now()`. HUELLA: SHA-256 con
 * `globalThis.crypto.subtle` (Web Crypto) — BLAKE3 no está en el navegador sin
 * dependencias: se deja dicho a propósito. Se normaliza `\r\n` a `\n` al hashear.
 */
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";

export interface CopiaMemoria { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; bytes: number; actualizadoMs: number | null; }
export interface ManifiestoMemoria { grupos: GrupoHuella[]; }
/** `divergente` aquí = el mismo cerebroId+memoriaId tiene huellas distintas. */
export interface GrupoHuella { huella: string; copias: CopiaMemoria[]; destinos: DestinoMemoria[]; ultimaCopia: CopiaMemoria | null; divergente: boolean; }
/** Memoria con huellas distintas; `masNueva` es la huella más nueva (empate → null). */
export interface DivergenciaMemoria { cerebroId: string; memoriaId: string; destinos: DestinoMemoria[]; masNueva: string | null; }
/** Solo propone (nunca borra) y SIEMPRE pide confirmación humana. */
export interface PropuestaLimpieza { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; motivo: string; requiereConfirmacion: true; }

const MOTIVO_LIMPIEZA = "Otra copia de esta memoria es idéntica por contenido y más reciente; esta sobra, quítala solo tras confirmar.";
const claveMemoria = (c: Pick<CopiaMemoria, "cerebroId" | "memoriaId">): string => JSON.stringify([c.cerebroId, c.memoriaId]);
const compararCopias = (a: CopiaMemoria, b: CopiaMemoria): number =>
  a.destino.localeCompare(b.destino) || a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId) || a.huella.localeCompare(b.huella);

function copiasPorMemoria(m: ManifiestoMemoria): Map<string, CopiaMemoria[]> {
  const porMemoria = new Map<string, CopiaMemoria[]>();
  const agregar = (c: CopiaMemoria) => {
    const clave = claveMemoria(c);
    const lista = porMemoria.get(clave);
    if (lista) lista.push(c);
    else porMemoria.set(clave, [c]);
  };
  m.grupos.forEach((g) => g.copias.forEach(agregar));
  return porMemoria;
}

/** Copia más reciente; empate o todo sin fecha: la primera en orden determinista. */
function copiaMasReciente(copias: CopiaMemoria[]): CopiaMemoria | null {
  return [...copias].sort((a, b) => (b.actualizadoMs ?? -Infinity) - (a.actualizadoMs ?? -Infinity) || compararCopias(a, b))[0] ?? null;
}

/** Huella de la copia más nueva; empate entre huellas distintas o sin fechas → null. */
function huellaMasNueva(copias: CopiaMemoria[]): string | null {
  const max = Math.max(...copias.map((c) => c.actualizadoMs ?? -Infinity));
  if (max === -Infinity) return null;
  const enPunto = copias.filter((c) => c.actualizadoMs === max);
  const huellas = new Set(enPunto.map((c) => c.huella));
  return huellas.size === 1 ? enPunto[0].huella : null;
}

export async function huellaContenido(texto: string): Promise<string> {
  const digesto = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto.replace(/\r\n/g, "\n")));
  return Array.from(new Uint8Array(digesto), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Agrupa por huella; sin mapa extra: lo divergente se ve contra TODAS las copias. */
export function construirManifiesto(copias: CopiaMemoria[]): ManifiestoMemoria {
  const porHuella = new Map<string, CopiaMemoria[]>();
  for (const c of copias) {
    const lista = porHuella.get(c.huella);
    if (lista) lista.push(c);
    else porHuella.set(c.huella, [c]);
  }
  return {
    grupos: [...porHuella].map(([huella, acumuladas]) => {
      const ordenadas = [...acumuladas].sort(compararCopias);
      return {
        huella,
        copias: ordenadas,
        destinos: [...new Set(ordenadas.map((x) => x.destino))].sort(),
        ultimaCopia: copiaMasReciente(ordenadas),
        divergente: ordenadas.some((x) => copias.some((y) => y.huella !== huella && claveMemoria(y) === claveMemoria(x))),
      };
    }).sort((a, b) => a.huella.localeCompare(b.huella)),
  };
}

export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  const resultado: DivergenciaMemoria[] = [];
  for (const [clave, copias] of copiasPorMemoria(m)) {
    if (new Set(copias.map((c) => c.huella)).size < 2) continue;
    const [cerebroId, memoriaId] = JSON.parse(clave) as [string, string];
    resultado.push({ cerebroId, memoriaId, destinos: [...new Set(copias.map((c) => c.destino))].sort(), masNueva: huellaMasNueva(copias) });
  }
  return resultado.sort((a, b) => a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId));
}

export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const propuestas: PropuestaLimpieza[] = [];
  for (const [clave, copias] of copiasPorMemoria(m)) {
    const [cerebroId, memoriaId] = JSON.parse(clave) as [string, string];
    const ultima = copiaMasReciente(copias);
    for (const c of copias) {
      // Jamás la última copia ni la única de un destino local (regla del OS).
      if (c === ultima || (c.destino === "local" && copias.filter((x) => x.destino === "local").length === 1)) continue;
      propuestas.push({ cerebroId, memoriaId, destino: c.destino, huella: c.huella, motivo: MOTIVO_LIMPIEZA, requiereConfirmacion: true });
    }
  }
  return propuestas.sort((a, b) => a.cerebroId.localeCompare(b.cerebroId) || a.memoriaId.localeCompare(b.memoriaId) || a.destino.localeCompare(b.destino) || a.huella.localeCompare(b.huella));
}

/** Texto para personas: «12 memorias, 3 con copia única, 1 divergente». */
export function resumenManifiesto(m: ManifiestoMemoria): string {
  const porMemoria = copiasPorMemoria(m);
  let unicas = 0, divergentes = 0;
  for (const copias of porMemoria.values()) {
    if (copias.length === 1) unicas++;
    if (new Set(copias.map((c) => c.huella)).size > 1) divergentes++;
  }
  const total = porMemoria.size;
  const partes = [`${total} ${total === 1 ? "memoria" : "memorias"}`];
  if (unicas > 0) partes.push(`${unicas} con copia única`);
  if (divergentes > 0) partes.push(`${divergentes} ${divergentes === 1 ? "divergente" : "divergentes"}`);
  return partes.join(", ");
}
