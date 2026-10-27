/**
 * Manifiesto de las memorias de los cerebros (INF1025H · Ola 1025R, la lección
 * de Spacedrive): cuántas copias reales hay de cada memoria POR EL CONTENIDO
 * (huella), cuál es «la última copia», dónde divergen y qué limpieza se
 * PROPONE (siempre con confirmación; ningún borrado se propaga solo). Puro:
 * sin red, disco ni reloj. La huella es SHA-256 en hex con
 * `globalThis.crypto.subtle` (`\r\n` → `\n`); BLAKE3 (el de Spacedrive) no
 * está en el navegador sin dependencias: SHA-256, igual en cliente y servidor.
 */
export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";

export interface CopiaMemoria {
  cerebroId: string; memoriaId: string; destino: DestinoMemoria;
  huella: string; bytes: number;   actualizadoMs: number | null;
}

export interface GrupoHuella { huella: string; copias: CopiaMemoria[]; destinos: DestinoMemoria[]; ultimaCopia: CopiaMemoria | null; divergente: boolean; }

/** Huellas distintas en destinos distintos para una memoria; masNueva = null si empatan. */
export interface DivergenciaMemoria { cerebroId: string; memoriaId: string; copias: CopiaMemoria[]; masNueva: CopiaMemoria | null; }

/** SOLO propuestas: siempre `requiereConfirmacion: true`; jamás para una «última copia». */
export interface PropuestaLimpieza { cerebroId: string; memoriaId: string; destino: DestinoMemoria; huella: string; motivo: string; requiereConfirmacion: true; }

export interface ManifiestoMemoria { copias: CopiaMemoria[]; grupos: GrupoHuella[]; memorias: { cerebroId: string; memoriaId: string }[]; divergentes: DivergenciaMemoria[]; }

/** SHA-256 en hex del contenido; `\r\n` se normaliza a `\n` y el reloj no entra. */
export async function huellaContenido(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto.replace(/\r\n/g, "\n"));
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

const ORDEN_DESTINO: DestinoMemoria[] = ["local", "starseed", "gdrive", "p2p", "externo"];

/** Orden determinista: cerebro, memoria, destino y por último la huella. */
function comparar(a: CopiaMemoria, b: CopiaMemoria): number {
  const clave = (c: CopiaMemoria) => [c.cerebroId, c.memoriaId, String(ORDEN_DESTINO.indexOf(c.destino)), c.huella].join("\u0000");
  return clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0;
}

/** El empate de fechas devuelva null: la más nueva del grupo, si hay una vencedora clara. */
function masNueva(copias: CopiaMemoria[]): CopiaMemoria | null {
  const pares = copias.map((c) => ({ c, ms: c.actualizadoMs })).filter((p) => p.ms !== null);
  const maxMs = Math.max(...pares.map((p) => p.ms as number), Number.NEGATIVE_INFINITY);
  const ganadoras = pares.filter((p) => p.ms === maxMs);
  return ganadoras.length === 1 ? ganadoras[0].c : null;
}

/** Divergencia: copias del mismo (cerebro, memoria) con huella DISTINTA y destino distinto. */
function tieneDivergencia(lista: CopiaMemoria[]): boolean {
  return lista.some((a) => lista.some((b) => a.huella !== b.huella && a.destino !== b.destino));
}

const claveDe = (cerebroId: string, memoriaId: string): string => `${cerebroId}\u0000${memoriaId}`;

function agrupar(copias: CopiaMemoria[], clave: (c: CopiaMemoria) => string): Map<string, CopiaMemoria[]> {
  const mapa = new Map<string, CopiaMemoria[]>();
  for (const c of copias) mapa.set(clave(c), [...(mapa.get(clave(c)) || []), c]);
  return mapa;
}

function divergenciasDe(copias: CopiaMemoria[]): DivergenciaMemoria[] {
  const resultado: DivergenciaMemoria[] = [];
  for (const [clave, lista] of agrupar(copias, (c) => claveDe(c.cerebroId, c.memoriaId))) {
    if (!tieneDivergencia(lista)) continue;
    const dividido = clave.split("\u0000");
    resultado.push({ cerebroId: dividido[0], memoriaId: dividido[1], copias: lista, masNueva: masNueva(lista) });
  }
  return resultado;
}

export function construirManifiesto(copias: CopiaMemoria[]): ManifiestoMemoria {
  const ordenadas = [...copias].sort(comparar);
  const divergentes = divergenciasDe(ordenadas);
  const clavesDiv = new Set(divergentes.map((d) => claveDe(d.cerebroId, d.memoriaId)));
  const grupos = [...agrupar(ordenadas, (c) => c.huella)].map(([huella, lista]) => ({
    huella, copias: lista, divergente: lista.some((c) => clavesDiv.has(claveDe(c.cerebroId, c.memoriaId))),
    destinos: lista.map((c) => c.destino).filter((d, i, todos) => todos.indexOf(d) === i),
    ultimaCopia: lista.length === 1 ? lista[0] : null,
  }));
  const memorias = [...agrupar(ordenadas, (c) => claveDe(c.cerebroId, c.memoriaId))]
    .map(([, lista]) => ({ cerebroId: lista[0].cerebroId, memoriaId: lista[0].memoriaId }));
  return { copias: ordenadas, grupos, memorias, divergentes };
}

export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  return m.divergentes;
}

/** SOLO propuestas (siempre con confirmación): copia con huella idéntica y no única en «local». */
export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const propuestas: PropuestaLimpieza[] = [];
  for (const { cerebroId, memoriaId } of m.memorias) {
    const copias = m.copias.filter((c) => c.cerebroId === cerebroId && c.memoriaId === memoriaId);
    for (const [huella, lista] of agrupar(copias, (c) => c.huella)) {
      if (lista.length < 2) continue; // una sola copia por huella no es redundante
      const conservada = masNueva(lista) || lista[0]; // si empatan, la primera del orden determinista
      const unicaLocal = copias.filter((c) => c.destino === "local" && c.huella === huella).length === 1;
      for (const c of lista) {
        if (c === conservada || (c.destino === "local" && unicaLocal)) continue;
        propuestas.push({
          cerebroId, memoriaId, destino: c.destino, huella, requiereConfirmacion: true,
          motivo: `Copia redundante en «${c.destino}»: la misma huella ya vive en «${conservada.destino}»; quitarla no deja la memoria sin copia.`,
        });
      }
    }
  }
  return propuestas;
}

/** Resumen para personas, en español: «12 memorias, 3 con copia única, 1 divergente». */
export function resumenManifiesto(m: ManifiestoMemoria): string {
  const nCopias = (k: { cerebroId: string; memoriaId: string }) => m.copias.filter((c) => c.cerebroId === k.cerebroId && c.memoriaId === k.memoriaId).length;
  const unicas = m.memorias.filter((k) => nCopias(k) === 1).length;
  const total = m.memorias.length;
  const divergentes = m.divergentes.length;
  return `${total} ${total === 1 ? "memoria" : "memorias"}, ${unicas} con copia única, ${divergentes} ${divergentes === 1 ? "divergente" : "divergentes"}`;
}
