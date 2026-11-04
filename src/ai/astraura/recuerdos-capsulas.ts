// Recuerdos de las cápsulas Memvid en Astraura (MVD1027F) — módulo PURO: sin red, sin disco, sin procesos.
// Solo lógica de búsqueda, filtrado por alcance y detección de fuga. La E/S real (fetch a /api/memorias/capsulas)
// se inyecta como dependencia para que sea testeable. Contrato: architecture/memvid-capsulas.md §3.
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
import type { AciertoMemvid } from "@/lib/memorias/memvid-cliente";

/** Cuántos aciertos pide por cápsula. */
export const K_POR_CAPSULA = 4;
/** Máximo de fragmentos totales que se devuelven. */
export const MAX_FRAGMENTOS = 6;
/** Máximo de caracteres totales en el bloque de recuerdos. */
export const MAX_CARACTERES = 1500;
/** Tope total de la operación en ms. */
export const TOPE_TOTAL_MS = 800;

/** Buscador de cápsulas inyectable (en vivo llama al servidor; en tests usa un fake). */
export type BuscarCapsulaFn = (
  sujeto: SujetoMemoria,
  consulta: string,
  k: number,
) => Promise<AciertoMemvid[] | null>;

export interface RecordarOpciones {
  /** Quién pregunta: si falta, el propio usuario. Los agentes de grupo no ven lo privado. */
  actor?: ActorMemoria;
  /** El modelo elegido es de la nube: lo personal y lo que se le parezca NO sale. */
  enNube?: boolean;
  /** Fecha fija para las pruebas; en vivo, el trimestre de hoy. */
  fecha?: Date;
  /** Tope total en ms (defecto 800). */
  timeoutMs?: number;
  /** memoryScope del chat: "personal" desactiva las cápsulas. */
  memoryScope?: string;
  /** Buscador falso para las pruebas; en vivo, el cliente del servidor de cápsulas. */
  buscar?: BuscarCapsulaFn;
}

function memoriaScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

function aFragmentoMemoria(
  acierto: AciertoMemvid,
  capsula: { nombre: string; alcance: AlcanceMemoria },
): FragmentoMemoria {
  return {
    id: `${capsula.nombre}#${Date.now()}-${Math.random()}`,
    alcance: capsula.alcance,
    texto: acierto.texto,
    origen: acierto.uri ?? acierto.titulo ?? capsula.nombre,
    at: acierto.ts ?? Date.now(),
  };
}

export async function recordarDeCapsulas(
  contexto: ContextoCapsulas,
  consulta: string,
  opciones: RecordarOpciones = {},
): Promise<string> {
  const {
    actor,
    enNube = false,
    fecha = new Date(),
    timeoutMs = TOPE_TOTAL_MS,
    memoryScope,
    buscar,
  } = opciones;

  const textoConsulta = consulta.trim();
  if (!textoConsulta) return "";

  if (!memoriaScopeActivaCapsulas(memoryScope)) return "";

  const actorReal: ActorMemoria = actor ?? { tipo: "usuario" };
  const permitidos = alcanceVisiblePara(actorReal);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actorReal, fecha);
  if (capsulas.length === 0) return "";

  const buscarReal = buscar ?? (async () => null);
  const fin = Date.now() + timeoutMs;

  try {
    const todos: FragmentoMemoria[] = [];
    let caracteresTotales = 0;

    for (const capsula of capsulas) {
      if (Date.now() >= fin) break;
      if (todos.length >= MAX_FRAGMENTOS) break;
      if (caracteresTotales >= MAX_CARACTERES) break;

      const aciertos = await Promise.race([
        buscarReal(capsula.sujeto, textoConsulta, K_POR_CAPSULA),
        new Promise<AciertoMemvid[] | null>((resolve) => {
          const ms = Math.max(0, fin - Date.now());
          setTimeout(() => resolve(null), ms);
        }),
      ]);
      if (!aciertos || aciertos.length === 0) continue;

      const fragmentos = aciertos.map((a) => aFragmentoMemoria(a, capsula));
      const filtrados = filtrarParaAlcance(fragmentos, permitidos);

      let cupoLleno = false;
      for (const fr of filtrados) {
        if (todos.length >= MAX_FRAGMENTOS) {
          cupoLleno = true;
          break;
        }
        const quede = MAX_CARACTERES - caracteresTotales;
        if (fr.texto.length > quede) {
          // Truncar el fragmento para ajustarse al límite
          todos.push({ ...fr, texto: fr.texto.slice(0, quede) });
          caracteresTotales = MAX_CARACTERES;
          cupoLleno = true;
          break;
        }
        todos.push(fr);
        caracteresTotales += fr.texto.length;
      }
      if (cupoLleno) break;
    }

    if (todos.length === 0) return "";

    // Si es modelo de nube, filtrar lo personal ANTES de construir el bloque
    let visibles = enNube
      ? todos.filter((fr) => fr.alcance !== "personal")
      : todos;

    if (visibles.length === 0) return "";

    let bloque = "RECUERDOS (cápsulas Memvid):\n";
    for (const fr of visibles) {
      bloque += `- ${fr.texto}\n`;
    }

    if (enNube) {
      const personales = todos.filter((fr) => fr.alcance === "personal");
      if (personales.length > 0) {
        const fugas = detectarFuga(bloque, personales);
        if (fugas.length > 0) {
          return "";
        }
      }
    }

    return bloque.trimEnd();
  } catch {
    return "";
  }
}

// Re-export para que los tests no tengan que importar de dos sitios
export { alcanceVisiblePara } from "@/lib/nucleo/alcance-memoria";