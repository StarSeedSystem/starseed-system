// Recuerdos de las cápsulas Memvid en Astraura (MVD1027F, parte 1) — mezcla del
// avance de la nube sobre el cableado de main. Módulo PURO: sin red, sin disco,
// sin procesos. La E/S real (buscador de cápsulas) se inyecta como dependencia.
import {
  capsulasParaContexto,
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
  /** Función de búsqueda (en vivo: llama a /api/memorias/capsulas; en tests: falso). */
  buscar: BuscarCapsulaFn;
  /** Si el modelo elegido es de la nube → lo personal NO sale y se cierra con detectarFuga. */
  esModeloNube?: boolean;
  /** Tope total en ms (por defecto 800): vencido, sale con «», nunca tumba la conversación. */
  timeoutMs?: number;
  /** memoryScope del chat: «personal» desactiva las cápsulas. */
  memoryScope?: string;
}

/** Máximo de fragmentos totales que se devuelven. */
export const MAX_FRAGMENTOS = 6;
/** Máximo de caracteres totales en el bloque de recuerdos. */
export const MAX_CARACTERES = 1500;
/** k por cápsula. */
export const K_POR_CAPSULA = 4;
/** Tope total por defecto de toda la operación (800 ms). */
export const TOPE_RECUERDOS_MS = 800;

function memoriaScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

function aFragmentoMemoria(acierto: AciertoCapsula, nombreCapsula: string, orden: number): FragmentoMemoria {
  return {
    id: `${nombreCapsula}#${orden}`,
    alcance: acierto.alcance,
    texto: typeof acierto.texto === "string" ? acierto.texto.trim() : "",
    origen: typeof acierto.uri === "string" && acierto.uri.length > 0 ? acierto.uri : `cápsula:${nombreCapsula}`,
    at: typeof acierto.ts === "number" ? acierto.ts : 0,
  };
}

/** Recorre las cápsulas, busca en cada una de la más cercana a la más general y compone
 * el bloque. Nada de esto sale de aquí si falla: la memoria nunca tumba la conversación. */
async function armarRecuerdos(opts: RecordarOpciones): Promise<string> {
  const { consulta, contexto, buscar, esModeloNube = false } = opts;
  if (!consulta.trim()) return "";
  const actor = contexto.actor;
  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  try {
    const todos: FragmentoMemoria[] = [];
    let caracteresTotales = 0;
    let orden = 0;

    for (const capsula of capsulas) {
      if (todos.length >= MAX_FRAGMENTOS || caracteresTotales >= MAX_CARACTERES) break;
      const aciertos = await buscar(capsula.sujeto, consulta, K_POR_CAPSULA);
      if (!Array.isArray(aciertos)) continue; // esa cápsula no llegó a responder: no falla
      const fragmentos = aciertos
        .map((a) => aFragmentoMemoria(a, capsula.nombre, orden++))
        .filter((fr) => fr.texto.length > 0);
      const filtrados = filtrarParaAlcance(fragmentos, alcanceVisiblePara(actor));
      for (const fr of filtrados) {
        if (todos.length >= MAX_FRAGMENTOS) break;
        if (caracteresTotales + fr.texto.length > MAX_CARACTERES) break;
        todos.push(fr);
        caracteresTotales += fr.texto.length;
      }
    }
    return bloqueFinal(todos, esModeloNube);
  } catch {
    return "";
  }
}

/** Bloque final: valla de fuga si va para la nube, cabecera, o «» si no hay nada. */
function bloqueFinal(todos: FragmentoMemoria[], esModeloNube: boolean): string {
  let visibles = todos;
  if (esModeloNube) {
    // Antes de salir hacia un modelo de la nube: lo personal NO va en el bloque y,
    // como valla final del contrato, `detectarFuga` contra lo personal que había.
    const personales = todos.filter((fr) => fr.alcance === "personal");
    visibles = todos.filter((fr) => fr.alcance !== "personal");
    if (detectarFuga(visibles.map((fr) => fr.texto).join("\n"), personales).length > 0) {
      return "";
    }
  }
  if (visibles.length === 0) return "";
  return ["RECUERDOS (cápsulas Memvid):", ...visibles.map((fr) => `- ${fr.texto}`)].join("\n");
}

/** Carrera entre el armado y el tope total: vencido el plazo, «» (y el reloj se limpia). */
function conTopeTotal(promesa: Promise<string>, topeMs: number): Promise<string> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => resolver(""), topeMs);
    promesa.then(
      (bloque) => { clearTimeout(temporizador); resolver(bloque); },
      () => { clearTimeout(temporizador); resolver(""); },
    );
  });
}

/** Recuerdos de las cápsulas del contexto para responder, o «» si no hay nada que decir. */
export async function recordarDeCapsulas(opts: RecordarOpciones): Promise<string> {
  try {
    if (!memoriaScopeActivaCapsulas(opts.memoryScope)) return "";
    return await conTopeTotal(armarRecuerdos(opts), opts.timeoutMs ?? TOPE_RECUERDOS_MS);
  } catch {
    return "";
  }
}

// Re-export para que los tests no tengan que importar de dos sitios
export { alcanceVisiblePara } from "@/lib/nucleo/alcance-memoria";
