// Recuerdos de las cápsulas en Astraura: Memvid y LEANN A LA VEZ (LNN1028F-b) —
// módulo PURO: sin red, sin disco, sin procesos. La búsqueda en vivo se inyecta
// (Memvid: fetch a /api/memorias/capsulas; LEANN: la acción «leann» de esa misma ruta,
// que en el servidor usa el cliente del A1 por el túnel). Sin el servidor de LEANN
// el recuerdo sigue con Memvid y nada falla. Fusión RRF en
// src/lib/memorias/fusion-recuerdos.ts (LNN1028A); contrato: leann-recuerdo-semantico.md §4.
import {
  capsulasParaContexto, alcanceDe, saneaId,
  type CapsulaMemoria, type ContextoCapsulas, type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import { fundirRecuerdos, pesoVectorPara, type Recuerdo } from "@/lib/memorias/fusion-recuerdos";
import {
  filtrarParaAlcance, detectarFuga, alcanceVisiblePara,
  type FragmentoMemoria, type ActorMemoria, type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";

export interface AciertoCapsula {
  titulo: string;
  texto: string;
  uri?: string;
  ts?: number;
  alcance: AlcanceMemoria;
  sujeto: SujetoMemoria;
}

export type BuscarCapsulaFn = (
  sujeto: SujetoMemoria,
  consulta: string,
  k: number,
) => Promise<AciertoCapsula[] | null>;

/** Acierto del índice LEANN (<tipo>-<id>-<alcance>) del mismo sujeto de la cápsula. */
export interface AciertoLeann { id: string; texto: string; metadatos?: Record<string, string | number> }

export type BuscarLeannFn = (
  indice: string,
  consulta: string,
  opciones: { k: number; filtros: Record<string, unknown>; pesoVector: number },
) => Promise<AciertoLeann[] | null>;

/** Herramientas de `recordar(contexto, consulta)`: la E/S se inyecta, no vive aquí. */
export interface OpcionesRecordar {
  buscar: BuscarCapsulaFn; buscarLeann?: BuscarLeannFn;
  esModeloNube?: boolean; timeoutMs?: number; memoryScope?: string;
}

/** Forma de opciones que traía `recordarDeCapsulas` desde MVD1027F. */
export interface RecordarOpciones extends OpcionesRecordar {
  consulta: string;
  contexto: ContextoCapsulas & { actor: ActorMemoria };
}

export { alcanceVisiblePara, type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";

/** k igual para Memvid y LEANN; tope total: lo que llegue tarde no entra; juicio barato. */
const K_POR_CAPSULA = 4;
const TOPE_MS_DEFECTO = 900;
const MINIMO_PALABRAS = 4;

const ALCANCES = new Set<string>(["personal", "perfil", "grupo", "publica"]);

function memoriaScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

/** Menos de 4 palabras sin «?» no busca (juicio barato de LNN1028F). */
function consultaMereceBusqueda(consulta: string): boolean {
  const limpia = consulta.trim();
  return limpia.length > 0
    && (/[\u00bf?]/.test(limpia) || limpia.split(/\s+/).length >= MINIMO_PALABRAS);
}

function aRecuerdoMemvid(a: AciertoCapsula): Recuerdo {
  return { uri: "", texto: a.texto, titulo: a.titulo, ts: a.ts, fuente: "memvid", alcance: a.alcance };
}

function aRecuerdoLeann(a: AciertoLeann, alcanceBase: AlcanceMemoria): Recuerdo {
  const meta = a.metadatos?.alcance;
  const alcance = typeof meta === "string" && ALCANCES.has(meta)
    ? (meta as AlcanceMemoria) : alcanceBase;
  return { uri: "", texto: a.texto, fuente: "leann", alcance };
}

/** uri vacía en los dos: la fusión dedupe por huella del texto, así la misma memoria
 * vista por Memvid y por LEANN sale UNA sola vez, con las dos fuentes en `fuentes`. */
function aFragmentoMemoria(r: Recuerdo): FragmentoMemoria {
  return {
    id: `fusion-${r.fuentes?.[0] ?? r.fuente}`, alcance: r.alcance, texto: r.texto,
    origen: r.titulo ?? r.fuente, at: r.ts ?? Date.now(),
  };
}

/** Índice LEANN del sujeto: el nombre de la cápsula sin trimestre ni parte ni extensión. */
function indiceDeSujeto(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcanceDe(sujeto)}`;
}

/** Pide a Memvid y a LEANN para una cápsula, A LA VEZ; el que falle cae a []
 * (sin LEANN inyectado —navegador o pruebas— solo se consulta Memvid). */
async function loteDeCapsula(
  capsula: CapsulaMemoria, consulta: string, permitidos: AlcanceMemoria[],
  buscar: BuscarCapsulaFn, buscarLeann?: BuscarLeannFn,
): Promise<Recuerdo[]> {
  const [deMemvid, deLeann] = await Promise.all([
    buscar(capsula.sujeto, consulta, K_POR_CAPSULA).catch(() => null),
    buscarLeann
      ? buscarLeann(indiceDeSujeto(capsula.sujeto), consulta, {
        k: K_POR_CAPSULA, filtros: { alcance: { in: permitidos } },
        pesoVector: pesoVectorPara(consulta),
      }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const alcanceBase = alcanceDe(capsula.sujeto);
  return [
    ...(deMemvid ?? []).map(aRecuerdoMemvid),
    ...(deLeann ?? []).map((a) => aRecuerdoLeann(a, alcanceBase)),
  ];
}

/** Núcleo común: `aplicaBarato` es solo de la forma nueva (juicio barato). */
async function hacerRecordar(
  contexto: ContextoCapsulas & { actor: ActorMemoria },
  consulta: string,
  herramientas: OpcionesRecordar,
  aplicaBarato: boolean,
): Promise<string> {
  if (aplicaBarato && !consultaMereceBusqueda(consulta)) return "";
  if (!memoriaScopeActivaCapsulas(herramientas.memoryScope)) return "";
  const permitidos = alcanceVisiblePara(contexto.actor);
  const capsulas = capsulasParaContexto(contexto, contexto.actor);
  if (permitidos.length === 0 || capsulas.length === 0) return "";

  const buscarLeann = herramientas.buscarLeann;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error("recordar: tope de tiempo")),
      herramientas.timeoutMs ?? TOPE_MS_DEFECTO);
  });
  try {
    const lotes = await Promise.race([
      Promise.all(capsulas.map((c) =>
        loteDeCapsula(c, consulta, permitidos, herramientas.buscar, buscarLeann))),
      tope,
    ]);
    const visibles = filtrarParaAlcance(
      fundirRecuerdos(lotes).map(aFragmentoMemoria), permitidos);
    if (visibles.length === 0) return "";
    let bloque = `RECUERDOS (cápsulas Memvid):\n${visibles.map((fr) => `- ${fr.texto}`).join("\n")}`;
    if (herramientas.esModeloNube) {
      const personales = visibles.filter((fr) => fr.alcance === "personal");
      if (personales.length > 0 && detectarFuga(bloque, personales).length > 0) {
        bloque = `[FUGA DETECTADA] ${bloque}`;
      }
    }
    return bloque;
  } catch { return ""; } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** El «recordar» fundido (LNN1028F): Memvid y LEANN a la vez, RRF, tope de 900 ms. */
export function recordar(
  contexto: ContextoCapsulas & { actor: ActorMemoria },
  consulta: string,
  herramientas: OpcionesRecordar,
): Promise<string> {
  return hacerRecordar(contexto, consulta, herramientas, true);
}

/** Alias compatible (MVD1027F): la misma fusión pero sin el filtro de consulta barata. */
export function recordarDeCapsulas(opts: RecordarOpciones): Promise<string> {
  return hacerRecordar(opts.contexto, opts.consulta, opts, false);
}
