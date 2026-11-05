// Recuerdos de las cápsulas Memvid en Astraura (MVD1027F-d1c, parte 1) —
// módulo PURO: sin red, sin disco, sin procesos. Solo lógica de búsqueda,
// límites, filtrado por alcance y detección de fuga, según el contrato
// architecture/memvid-capsulas.md §3. La E/S real (el cliente del servidor
// de cápsulas) se inyecta como dependencia: en las pruebas ni una llamada.
import {
  capsulasParaContexto,
  type CapsulaMemoria,
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
  /** Función de búsqueda (en vivo: el cliente de cápsulas del servidor; en tests: el falso). */
  buscar: BuscarCapsulaFn;
  /** Si el modelo elegido es de la nube: no viaja lo personal y pasa detectarFuga. */
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
/** Tope total de la operación (contrato §3): si se pasa, sale con lo que haya o «». */
const TOPE_TOTAL_MS = 800;

function memoryScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

function aFragmentoMemoria(acierto: AciertoCapsula): FragmentoMemoria {
  return {
    id: acierto.uri ?? `cápsula:${acierto.sujeto.tipo}:${acierto.sujeto.id}`,
    alcance: acierto.alcance,
    texto: acierto.texto.trim(),
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
    timeoutMs = TOPE_TOTAL_MS,
    memoryScope,
  } = opts;

  if (!memoryScopeActivaCapsulas(memoryScope)) return "";

  const textoConsulta = consulta.trim();
  if (!textoConsulta) return "";

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  // Tope total como carrera: aunque el buscador se cuelgue y no escuche
  // señales, sale a tiempo con «» — la memoria nunca tumba la conversación.
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    const trabajo = componeRecuerdos(
      textoConsulta, capsulas, permitidos, buscar, esModeloNube,
    );
    const fueraDePlazo = new Promise<string>((resuelto) => {
      temporizador = setTimeout(() => resuelto(""), timeoutMs);
    });
    return await Promise.race([trabajo, fueraDePlazo]);
  } catch {
    return "";
  } finally {
    clearTimeout(temporizador);
  }
}

/** Recorre las cápsulas, busca y compone el bloque. Un fallo interno sale como «». */
async function componeRecuerdos(
  consulta: string,
  capsulas: CapsulaMemoria[],
  permitidos: AlcanceMemoria[],
  buscar: BuscarCapsulaFn,
  esModeloNube: boolean,
): Promise<string> {
  try {
    const todos: FragmentoMemoria[] = [];
    let caracteresTotales = 0;

    for (const capsula of capsulas) {
      if (todos.length >= MAX_FRAGMENTOS) break;
      if (caracteresTotales >= MAX_CARACTERES) break;

      const aciertos = await buscar(capsula.sujeto, consulta, K_POR_CAPSULA);
      if (!aciertos || aciertos.length === 0) continue;

      const filtrados = filtrarParaAlcance(
        aciertos.map(aFragmentoMemoria), permitidos,
      );
      for (const fr of filtrados) {
        if (todos.length >= MAX_FRAGMENTOS) break;
        const queda = MAX_CARACTERES - caracteresTotales;
        if (queda <= 0) break;
        // Al llenar el cupo de caracteres se recorta el último, no se tira.
        const recortado = fr.texto.length > queda ? fr.texto.slice(0, queda) : fr.texto;
        if (!recortado) continue;
        todos.push({ ...fr, texto: recortado });
        caracteresTotales += recortado.length;
      }
    }

    let visibles = todos;
    if (esModeloNube) {
      // Antes de salir hacia un modelo de la nube: no viaja lo personal y, como
      // valla final del contrato, detectarFuga contra lo personal de otra vía.
      const personales = visibles.filter((fr) => fr.alcance === "personal");
      visibles = visibles.filter((fr) => fr.alcance !== "personal");
      const fuga = detectarFuga(
        visibles.map((fr) => fr.texto).join("\n"), personales,
      );
      if (fuga.length > 0) return "";
    }

    if (visibles.length === 0) return "";
    return ["RECUERDOS (cápsulas Memvid):", ...visibles.map((fr) => `- ${fr.texto}`)].join("\n");
  } catch {
    return "";
  }
}

