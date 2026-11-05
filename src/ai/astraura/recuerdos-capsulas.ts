// Recuerdos de las cápsulas Memvid y LEANN en Astraura (MVD1027F, LNN1028F) —
// módulo PURO: sin red, sin disco, sin procesos. La E/S real (fetch a /api/memorias/capsulas
// y al servidor LEANN del A1) se inyecta como dependencia para que sea testeable.
import {
  capsulasParaContexto,
  alcanceDe,
  type ContextoCapsulas,
  type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import { fundirRecuerdos, pesoVectorPara } from "@/lib/memorias/fusion-recuerdos";
import {
  filtrarParaAlcance,
  detectarFuga,
  alcanceVisiblePara,
  type FragmentoMemoria,
  type ActorMemoria,
  type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";

// Re-exports para tests y uso externo
export { alcanceVisiblePara, type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
export { alcanceDe } from "@/lib/memorias/capsulas";
export { fundirRecuerdos, pesoVectorPara } from "@/lib/memorias/fusion-recuerdos";

/** Acierto de Memvid (palabras clave + tiempo). */
export interface AciertoMemvid {
  titulo: string;
  texto: string;
  uri?: string;
  ts?: number;
  /** Alcance del fragmento (inyectado por la capa de búsqueda para tests; en vivo sale de la cápsula). */
  alcance?: AlcanceMemoria;
}

/** Acierto de LEANN (significado semántico). */
export interface AciertoLeann {
  id: string;
  puntuacion: number;
  texto: string;
  metadatos?: Record<string, string | number>;
}

/** Opciones de búsqueda LEANN. */
export interface OpcionesBuscarLeann {
  k?: number;
  filtros?: Record<string, unknown>;
  pesoVector?: number;
}

/** Función de búsqueda Memvid inyectada (en vivo llama a /api/memorias/capsulas; en tests: fake). */
export type BuscarMemvidFn = (
  sujeto: SujetoMemoria,
  consulta: string,
  k: number,
) => Promise<AciertoMemvid[] | null>;

/** @deprecated Usa `BuscarMemvidFn`. Mantenido para compatibilidad con tests existentes. */
export type BuscarCapsulaFn = BuscarMemvidFn;

/** Función de búsqueda LEANN inyectada (en vivo llama al servidor LEANN del A1; en tests: fake). */
export type BuscarLeannFn = (
  indice: string,
  consulta: string,
  opciones: OpcionesBuscarLeann,
) => Promise<AciertoLeann[] | null>;

/** Opciones del `recordarDeCapsulas` clásico (solo Memvid, devuelve string). */
export interface RecordarOpciones {
  /** Consulta del usuario. */
  consulta: string;
  /** Contexto del chat: qué cápsulas buscar y quién pregunta. */
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  /** Función de búsqueda Memvid inyectada. */
  buscar: BuscarMemvidFn;
  /** Si el modelo elegido es de la nube → ejecuta detectarFuga contra lo personal. */
  esModeloNube?: boolean;
  /** Tope total en ms (por defecto 800). */
  timeoutMs?: number;
  /** memoryScope del chat: "personal" desactiva las cápsulas. */
  memoryScope?: string;
}

/** Opciones del `recordar` multimodal (Memvid + LEANN, devuelve Recordar). */
export interface RecordarMultimodalOpciones {
  consulta: string;
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  /** Función de búsqueda Memvid inyectada. */
  buscarMemvid: BuscarMemvidFn;
  /** Función de búsqueda LEANN inyectada. */
  buscarLeann: BuscarLeannFn;
  esModeloNube?: boolean;
  timeoutMs?: number;
  memoryScope?: string;
  pesoVector?: number;
}

/** Resultado de `recordar`: tres bloques (Memvid, LEANN, fusionado). */
export interface Recordar {
  /** Resultado de Memvid (palabras clave + tiempo). */
  memoria: string;
  /** Resultado de LEANN (significado). */
  leann: string;
  /** Resultado combinado (RRF de ambos). */
  combinado: string;
}

const PESO_VECTOR_POR_DEFECTO = 0.5;
/** Máximo de fragmentos totales que se devuelven. */
const MAX_FRAGMENTOS = 6;
/** k por cápsula. */
const K_POR_CAPSULA = 4;
/** Tope total en ms para el `recordar` multimodal. */
const TOPE_MS_MULTIMODAL = 900;
/** Umbral de palabras para juicio barato: menos de 4 palabras sin «?» no busca. */
const MINIMO_PALABRAS = 4;

function memoriaScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

function consultaMereceBusqueda(consulta: string): boolean {
  const limpia = consulta.trim();
  return limpia.length > 0 && (limpia.includes("?") || limpia.split(/\s+/).length >= MINIMO_PALABRAS);
}

function aFragmentoDeMemvid(acierto: AciertoMemvid, alcance: AlcanceMemoria): FragmentoMemoria {
  return {
    id: acierto.uri ?? `memvid-${Date.now()}`,
    alcance: acierto.alcance ?? alcance,
    texto: acierto.texto,
    origen: acierto.titulo ?? "Memvid",
    at: acierto.ts ?? Date.now(),
  };
}

function aFragmentoDeLeann(acierto: AciertoLeann, alcance: AlcanceMemoria): FragmentoMemoria {
  return {
    id: acierto.id || `leann-${Date.now()}`,
    alcance: (acierto.metadatos?.alcance as AlcanceMemoria) ?? alcance,
    texto: acierto.texto,
    origen: "LEANN",
    at: Date.now(),
  };
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

/** Nombre del índice LEANN de un sujeto (igual que el nombre de la cápsula sin parte ni extensión). */
function nombreIndiceLeann(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${sujeto.id}-${alcanceDe(sujeto)}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * El «recordar» fundido (LNN1028F): Memvid y LEANN a la vez, RRF, tope de 900 ms.
 * Si la consulta es de menos de 4 palabras y sin «?», no busca (juicio barato).
 */
export async function recordar(opts: RecordarMultimodalOpciones): Promise<Recordar> {
  const {
    consulta,
    contexto,
    buscarMemvid,
    buscarLeann,
    esModeloNube = false,
    timeoutMs = TOPE_MS_MULTIMODAL,
    memoryScope,
    pesoVector = PESO_VECTOR_POR_DEFECTO,
  } = opts;

  // Juicio barato: menos de 4 palabras y sin pregunta → no busca
  if (!consultaMereceBusqueda(consulta)) {
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

    const promises = capsulas.map(async (capsula) => {
      const sujeto = capsula.sujeto;
      const indiceLeann = nombreIndiceLeann(sujeto);

      const [memvidRaw, leannRaw] = await Promise.all([
        buscarMemvid(sujeto, consulta, K_POR_CAPSULA),
        buscarLeann(indiceLeann, consulta, {
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

    const combinado = fundirRecuerdos([
      memvidLimitado.map((fr) => ({ ...fr, fuente: "memvid" as const, uri: fr.id })),
      leannLimitado.map((fr) => ({ ...fr, fuente: "leann" as const, uri: fr.id })),
    ]);

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

/** Alias retrocompatible: `recordarDeCapsulas` clásico (usa la fusión pero sin el filtro de consulta barata). */
export async function recordarDeCapsulas(opts: RecordarOpciones): Promise<string> {
  const {
    consulta,
    contexto,
    buscar,
    esModeloNube = false,
    timeoutMs = 800,
    memoryScope,
  } = opts;

  if (!memoriaScopeActivaCapsulas(memoryScope)) return "";

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const todos: FragmentoMemoria[] = [];
    let caracteresTotales = 0;

    for (const capsula of capsulas) {
      if (todos.length >= MAX_FRAGMENTOS) break;
      if (caracteresTotales >= 1500) break;

      const aciertos = await buscar(capsula.sujeto, consulta, K_POR_CAPSULA);
      if (!aciertos || aciertos.length === 0) continue;

      const fragmentos = aciertos.map((a) => aFragmentoDeMemvid(a, alcanceDe(capsula.sujeto)));
      const filtrados = filtrarParaAlcance(fragmentos, permitidos);

      for (const fr of filtrados) {
        if (todos.length >= MAX_FRAGMENTOS) break;
        if (caracteresTotales + fr.texto.length > 1500) break;
        todos.push(fr);
        caracteresTotales += fr.texto.length;
      }
    }

    if (todos.length === 0) return "";

    let bloque = "RECUERDOS (cápsulas Memvid):\n";
    for (const fr of todos) {
      bloque += `- ${fr.texto}\n`;
    }

    if (esModeloNube) {
      const personales = todos.filter((fr) => fr.alcance === "personal");
      if (personales.length > 0) {
        const fugas = detectarFuga(bloque, personales);
        if (fugas.length > 0) {
          bloque = "[FUGA DETECTADA] " + bloque;
        }
      }
    }

    return bloque.trimEnd();
  } catch {
    return "";
  } finally {
    clearTimeout(temporizador);
  }
}