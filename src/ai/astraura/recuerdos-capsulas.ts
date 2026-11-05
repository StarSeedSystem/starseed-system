// Recuerdos de las cápsulas Memvid y LEANN en Astraura (MVD1027F-d1c, LNN1028F) —
// módulo PURO: sin red, sin disco, sin procesos. Solo lógica de búsqueda,
// filtrado por alcance y detección de fuga. La E/S real (fetch a /api/memorias/capsulas)
// se inyecta como dependencia para que sea testeable.
import {
  capsulasParaContexto,
  alcanceDe,
  type ContextoCapsulas,
  type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import {
  filtrarParaAlcance,
  detectarFuga,
  alcanceVisiblePara,
  type FragmentoMemoria,
  type ActorMemoria,
  type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";

export { alcanceVisiblePara, type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
export { alcanceDe } from "@/lib/memorias/capsulas";

export interface AciertoCapsula {
  titulo: string;
  texto: string;
  uri?: string;
  ts?: number;
  alcance: AlcanceMemoria;
  sujeto: SujetoMemoria;
}

export interface ResultadoBusquedaLeann {
  id: string;
  score: number;
  texto: string;
  metadatos?: Record<string, string | number>;
}

export interface Recordar {
  memoria: string;
  leann: string;
  combinado: string;
}

export type BuscarCapsulaFn = (
  sujeto: SujetoMemoria,
  consulta: string,
  k: number,
) => Promise<AciertoCapsula[] | null>;

export type BuscarLeannFn = (
  indice: string,
  consulta: string,
  opts: { k: number; filtros?: { alcance?: { in?: string[] } }; pesoVector?: number },
) => Promise<ResultadoBusquedaLeann[] | null>;

export interface RecordarOpciones {
  consulta: string;
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  buscar: BuscarCapsulaFn;
  esModeloNube?: boolean;
  timeoutMs?: number;
  memoryScope?: string;
}

export interface RecordarMultimodalOpciones {
  consulta: string;
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  esModeloNube?: boolean;
  timeoutMs?: number;
  memoryScope?: string;
  pesoVector?: number;
  buscarMemvid?: BuscarCapsulaFn;
  buscar?: BuscarCapsulaFn;
  buscarLeannFn?: BuscarLeannFn;
}

const MAX_FRAGMENTOS = 6;
const K_POR_CAPSULA = 4;
const PESO_VECTOR_POR_DEFECTO = 0.5;

function memoriaScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

interface AciertoMemvid {
  titulo?: string;
  texto: string;
  uri?: string;
  ts?: number;
}

function aFragmentoDeMemvid(acierto: AciertoMemvid, alcance: AlcanceMemoria): FragmentoMemoria {
  return {
    id: acierto.uri ?? `memvid-${Date.now()}`,
    alcance,
    texto: acierto.texto,
    origen: acierto.titulo ?? "Memvid",
    at: acierto.ts ?? Date.now(),
  };
}

interface AciertoLeannTipo {
  id?: string;
  texto: string;
  metadatos?: { alcance?: string; [key: string]: unknown };
}

function aFragmentoDeLeann(acierto: AciertoLeannTipo, alcance: AlcanceMemoria): FragmentoMemoria {
  return {
    id: acierto.id || `leann-${Date.now()}`,
    alcance: (acierto.metadatos?.alcance as AlcanceMemoria) ?? alcance,
    texto: acierto.texto,
    origen: "LEANN",
    at: Date.now(),
  };
}

function fundirRecuerdos(
  memvid: FragmentoMemoria[],
  leann: FragmentoMemoria[],
  k = 60,
): FragmentoMemoria[] {
  const mapa = new Map<string, number>();
  const todas = [...memvid, ...leann];

  for (let i = 0; i < memvid.length; i++) {
    const id = memvid[i].id;
    mapa.set(id, (mapa.get(id) ?? 0) + 1 / (k - i));
  }
  for (let i = 0; i < leann.length; i++) {
    const id = leann[i].id;
    mapa.set(id, (mapa.get(id) ?? 0) + 1 / (k - i));
  }

  const unicos = new Map<string, FragmentoMemoria>();
  for (const fr of todas) {
    if (!unicos.has(fr.id)) {
      unicos.set(fr.id, fr);
    }
  }

  return Array.from(unicos.values())
    .sort((a, b) => (mapa.get(b.id) ?? 0) - (mapa.get(a.id) ?? 0))
    .slice(0, 6);
}

function aBloqueMemvid(fragmentos: FragmentoMemoria[]): string {
  if (fragmentos.length === 0) return "";
  let bloque = "RECUERDOS (cápsulas Memvid):\n";
  for (const fr of fragmentos) {
    bloque += `- ${fr.texto}\n`;
  }
  return bloque.trimEnd();
}

function aBloqueLeann(fragmentos: FragmentoMemoria[]): string {
  if (fragmentos.length === 0) return "";
  let bloque = "RECUERDOS (significado LEANN):\n";
  for (const fr of fragmentos) {
    bloque += `- ${fr.texto}\n`;
  }
  return bloque.trimEnd();
}

function aBloqueCombinado(fragmentos: FragmentoMemoria[]): string {
  if (fragmentos.length === 0) return "";
  let bloque = "RECUERDOS (memoria + significado):\n";
  for (const fr of fragmentos) {
    bloque += `- ${fr.texto}\n`;
  }
  return bloque.trimEnd();
}

function nombreIndiceLeann(sujeto: SujetoMemoria): string {
  const saneaId = (id: string): string => {
    const limpio = id
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/(^-|-$)/g, "");
    return limpio || id;
  };
  const alcance = alcanceDe(sujeto);
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcance}`;
}

async function buscarLeannEnIndice(
  indice: string,
  consulta: string,
  opts: { k: number; filtros?: { alcance?: { in?: string[] } }; pesoVector?: number },
): Promise<ResultadoBusquedaLeann[] | null> {
  if (!opts.filtros?.alcance?.in?.length) return null;
  try {
    const { buscarLeann } = await import("@/lib/memorias/leann-cliente");
    return buscarLeann(indice, consulta, {
      k: opts.k,
      filtros: opts.filtros,
      pesoVector: opts.pesoVector,
    });
  } catch {
    return null;
  }
}

export async function recordar(opts: RecordarMultimodalOpciones): Promise<Recordar> {
  const {
    consulta,
    contexto,
    esModeloNube = false,
    timeoutMs = 900,
    memoryScope,
    pesoVector = PESO_VECTOR_POR_DEFECTO,
    buscarMemvid = opts.buscar ?? buscarMemvidDefault,
    buscarLeannFn = buscarLeannEnIndice,
  } = opts;

  if (consulta.split(/\s+/).length < 4 && !consulta.includes("?")) {
    return { memoria: "", leann: "", combinado: "" };
  }

  if (!memoriaScopeActivaCapsulas(memoryScope)) {
    return { memoria: "", leann: "", combinado: "" };
  }

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) {
    return { memoria: "", leann: "", combinado: "" };
  }

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) {
    return { memoria: "", leann: "", combinado: "" };
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const resultadosMemvid: FragmentoMemoria[] = [];
    const resultadosLeann: FragmentoMemoria[] = [];

    const promises: Promise<void>[] = capsulas.map(async (capsula) => {
      const sujeto = capsula.sujeto;

      const [memvidRaw, leannRaw] = await Promise.all([
        buscarMemvid(sujeto, consulta, K_POR_CAPSULA),
        buscarLeannFn(nombreIndiceLeann(sujeto), consulta, {
          k: K_POR_CAPSULA,
          filtros: { alcance: { in: permitidos } },
          pesoVector,
        }),
      ]);

      const alcanceCapsula = alcanceDe(sujeto);

      if (memvidRaw && memvidRaw.length > 0) {
        const frs = memvidRaw.map((a) => aFragmentoDeMemvid(a, alcanceCapsula));
        const filtrados = filtrarParaAlcance(frs, permitidos);
        resultadosMemvid.push(...filtrados);
      }

      if (leannRaw && leannRaw.length > 0) {
        const frs = leannRaw.map((a) => aFragmentoDeLeann(a, alcanceCapsula));
        const filtrados = filtrarParaAlcance(frs, permitidos);
        resultadosLeann.push(...filtrados);
      }
    });

    await Promise.all(promises);

    const memvidLimitado = resultadosMemvid.slice(0, MAX_FRAGMENTOS);
    const leannLimitado = resultadosLeann.slice(0, MAX_FRAGMENTOS);

    const combinado = fundirRecuerdos(
      memvidLimitado.slice(0, MAX_FRAGMENTOS),
      leannLimitado.slice(0, MAX_FRAGMENTOS),
    );

    const memoria = aBloqueMemvid(resultadosMemvid);
    const leann = aBloqueLeann(resultadosLeann);
    const combinadoStr = aBloqueCombinado(combinado);

    let combinadoFinal = combinadoStr;
    if (esModeloNube && combinado.length > 0) {
      const personales = combinado.filter((fr) => fr.alcance === "personal");
      if (personales.length > 0) {
        const fugas = detectarFuga(combinadoStr, personales);
        if (fugas.length > 0) {
          combinadoFinal = "[FUGA DETECTADA] " + combinadoFinal;
        }
      }
    }

    return { memoria, leann, combinado: combinadoFinal };
  } catch {
    return { memoria: "", leann: "", combinado: "" };
  } finally {
    clearTimeout(temporizador);
  }
}

function buscarMemvidDefault(
  _sujeto: SujetoMemoria,
  _consulta: string,
  _k: number,
): Promise<AciertoCapsula[] | null> {
  return buscarMemvidServer(null, "");
}

async function buscarMemvidServer(
  sujeto: SujetoMemoria | null,
  consulta: string,
): Promise<AciertoCapsula[] | null> {
  if (!sujeto || !consulta) return null;
  try {
    const { buscar } = await import("@/lib/memorias/memvid-cliente");
    const resultados = await buscar(sujeto, consulta, K_POR_CAPSULA);
    if (!resultados) return null;
    return resultados.map((a) => ({
      titulo: a.titulo,
      texto: a.texto,
      uri: a.uri,
      ts: a.ts,
      alcance: "personal" as AlcanceMemoria,
      sujeto,
    }));
  } catch {
    return null;
  }
}

export const recordarDeCapsulas = recordar;