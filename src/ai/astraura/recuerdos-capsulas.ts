// Recuerdos de las cápsulas Memvid en Astraura (MVD1027F-d1c, parte 1) —
// módulo PURO: sin red, sin disco, sin procesos. Solo lógica de búsqueda,
// filtrado por alcance y detección de fuga. La E/S real (fetch a /api/memorias/capsulas)
// se inyecta como dependencia para que sea testeable.
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
export { alcanceVisiblePara } from "@/lib/nucleo/alcance-memoria";