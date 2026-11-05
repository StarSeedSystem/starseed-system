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
  buscar,
  type AciertoMemvid,
} from "@/lib/memorias/memvid-cliente";
import {
  buscarLeann,
  nombreIndiceLeann,
  type AciertoLeann,
} from "@/lib/memorias/leann-cliente";
import {
  filtrarParaAlcance,
  detectarFuga,
  alcanceVisiblePara,
  type FragmentoMemoria,
  type ActorMemoria,
  type AlcanceMemoria,
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

export interface RecordarOpciones {
  /** Consulta del usuario. */
  consulta: string;
  /** Contexto del chat: qué cápsulas buscar y quién pregunta. */
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  /** Función de búsqueda (en vivo: llama a /api/memorias/capsulas; en tests: fake). */
  buscar: BuscarCapsulaFn;
  /** Si el modelo elegido es de la nube → ejecuta detectarFuga contra lo personal. */
  esModeloNube?: boolean;
  /** Tope total en ms (por defecto 800). */
  timeoutMs?: number;
  /** memoryScope del chat: "personal" desactiva las cápsulas. */
  memoryScope?: string;
}

/** Máximo de fragmentos totales que se devuelven. */
const MAX_FRAGMENTOS = 6;
/** Máximo de caracteres totales en el bloque de recuerdos. */
const MAX_CARACTERES = 1500;
/** k por cápsula. */
const K_POR_CAPSULA = 4;

function memoriaScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

function aFragmentoMemoria(
  acierto: AciertoCapsula,
): FragmentoMemoria {
  return {
    id: acierto.uri ?? `capsula-${Date.now()}-${Math.random()}`,
    alcance: acierto.alcance,
    texto: acierto.texto,
    origen: acierto.titulo ?? acierto.sujeto.tipo,
    at: acierto.ts ?? Date.now(),
  };
}

export async function recordarDeCapsulas(
  opts: RecordarOpciones,
): Promise<string> {
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
      if (caracteresTotales >= MAX_CARACTERES) break;

      const aciertos = await buscar(capsula.sujeto, consulta, K_POR_CAPSULA);
      if (!aciertos || aciertos.length === 0) continue;

      const fragmentos = aciertos.map(aFragmentoMemoria);
      const filtrados = filtrarParaAlcance(fragmentos, permitidos);

      for (const fr of filtrados) {
        if (todos.length >= MAX_FRAGMENTOS) break;
        if (caracteresTotales + fr.texto.length > MAX_CARACTERES) break;
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
          // En producción no se envía el bloque si hay fuga; aquí lo marcamos.
          // La llamada real en router.ts decidirá si suprimirlo.
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

// Re-export para que los tests no tengan que importar de dos sitios
export { alcanceVisiblePara, type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
export { alcanceDe } from "@/lib/memorias/capsulas";

// Re-exports de tipos de memvid-cliente y leann-cliente
export type { AciertoMemvid } from "@/lib/memorias/memvid-cliente";
export type { AciertoLeann } from "@/lib/memorias/leann-cliente";

export interface Recordar {
  memoria: string;
  leann: string;
  combinado: string;
}

const PESO_VECTOR_POR_DEFECTO = 0.5;

function aFragmentoDeMemvid(acierto: AciertoMemvid, alcance: AlcanceMemoria): FragmentoMemoria {
  return {
    id: acierto.uri ?? `memvid-${Date.now()}`,
    alcance,
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

function fundirRecuerdos(memvid: FragmentoMemoria[], leann: FragmentoMemoria[], k = 60): FragmentoMemoria[] {
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

export interface RecordarMultimodalOpciones {
  consulta: string;
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  esModeloNube?: boolean;
  timeoutMs?: number;
  memoryScope?: string;
  pesoVector?: number;
}

export async function recordar(opts: RecordarMultimodalOpciones): Promise<Recordar> {
  const {
    consulta,
    contexto,
    esModeloNube = false,
    timeoutMs = 900,
    memoryScope,
    pesoVector = PESO_VECTOR_POR_DEFECTO,
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

    const promesas = capsulas.map(async (capsula) => {
      const sujeto = capsula.sujeto;

      const [memvidRaw, leannRaw] = await Promise.all([
        buscar(sujeto, consulta, K_POR_CAPSULA, new Date(), { token: "test" }),
        buscarLeann(nombreIndiceLeann(sujeto), consulta, {
          k: K_POR_CAPSULA,
          filtros: { alcance: { in: permitidos } },
          pesoVector,
        }, { token: "test" }),
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

    await Promise.all(promesas);

    const memoria = aBloqueMemvid(resultadosMemvid);
    const leann = aBloqueLeann(resultadosLeann);
    const combinado = fundirRecuerdos(
      resultadosMemvid.slice(0, MAX_FRAGMENTOS),
      resultadosLeann.slice(0, MAX_FRAGMENTOS),
    );
    let combinadoStr = aBloqueCombinado(combinado);

    if (esModeloNube && combinado.length > 0) {
      const personales = combinado.filter((fr) => fr.alcance === "personal");
      if (personales.length > 0) {
        const fugas = detectarFuga(combinadoStr, personales);
        if (fugas.length > 0) {
          combinadoStr = "[FUGA DETECTADA] " + combinadoStr;
        }
      }
    }

    return { memoria, leann, combinado: combinadoStr };
  } catch {
    return { memoria: "", leann: "", combinado: "" };
  } finally {
    clearTimeout(temporizador);
  }
}

export const recordarDeCapsulas = recordar;