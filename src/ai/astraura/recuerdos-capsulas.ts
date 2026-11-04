<<<<<<< HEAD
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
=======
// Recuerdos de las cápsulas Memvid para Astraura (MVD1027F) — contrato: architecture/memvid-capsulas.md §3.
// Antes de responder, Astraura pregunta a las cápsulas del contexto (personalidad, agente, cerebro,
// perfil, grupo, página), de la más cercana a la más general, y devuelve el bloque «RECUERDOS
// (cápsulas Memvid):» o «» si no hay nada, el servidor falta o se pasa el tope total (800 ms):
// la memoria nunca tumba la conversación. Módulo SOLO DE SERVIDOR (usa el cliente de cápsulas).
import {
  capsulasParaContexto, type ContextoCapsulas, type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import {
  buscar as buscarDelServidor, type AciertoMemvid,
} from "@/lib/memorias/memvid-cliente";
import {
  alcanceVisiblePara, detectarFuga, filtrarParaAlcance,
  type ActorMemoria, type FragmentoMemoria,
} from "@/lib/nucleo/alcance-memoria";

/** Cuántos aciertos pide por cápsula. */
export const K_CAPSULA = 4;
/** Máximo de recuerdos del bloque, repasado entre todas las cápsulas. */
export const MAX_FRAGMENTOS = 6;
/** Máximo de caracteres de recuerdos, contados entre todos. */
export const MAX_CARACTERES = 1500;
/** Tope total de la operación: si se pasa, sale con lo que haya o «». */
export const TOPE_TOTAL_MS = 800;

/** El buscador de cápsulas, inyectable para las pruebas (el falso) y en vivo (el servidor). */
export interface BuscadorCapsulas {
  buscar(sujeto: SujetoMemoria, consulta: string, k: number, fecha: Date): Promise<AciertoMemvid[] | null>;
}

export interface OpcionesRecuerdos {
  /** Quién pregunta: si falta, el propio usuario. Los agentes de grupo no ven lo privado. */
  actor?: ActorMemoria;
  /** El modelo elegido es de la nube: lo personal y lo que se le parezca NO sale. */
  enNube?: boolean;
  /** Fecha fija para las pruebas; en vivo, el trimestre de hoy. */
  fecha?: Date;
  /** Tope total en ms (defecto 800). */
  topeMs?: number;
  /** Buscador falso para las pruebas; en vivo, el cliente del servidor de cápsulas. */
  buscar?: (sujeto: SujetoMemoria, consulta: string, k: number, fecha: Date) => Promise<AciertoMemvid[] | null>;
}

/** Recuerdos de las cápsulas del contexto para la conversación, o «» si no hay nada que decir. */
export async function recordarDeCapsulas(
  contexto: ContextoCapsulas, consulta: string, opciones: OpcionesRecuerdos = {},
): Promise<string> {
  const textoConsulta = consulta.trim();
  if (!textoConsulta) return "";
  const tope = opciones.topeMs ?? TOPE_TOTAL_MS;
  const fin = Date.now() + tope;
  const buscar = opciones.buscar ?? ((s: SujetoMemoria, c: string, k: number, f: Date) => buscarDelServidor(s, c, k, f));
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const fueraDePlazo = new Promise<string>((res) => {
    temporizador = setTimeout(() => res(""), tope);
  });
  try {
    return await Promise.race([armarRecuerdos(contexto, textoConsulta, opciones, buscar, fin), fueraDePlazo]);
>>>>>>> 598ba1d88 (salvavidas · MVD1027F-d1: trabajo del agente antes de las puertas (tsc / vitest))
  } finally {
    clearTimeout(temporizador);
  }
}

<<<<<<< HEAD
// Re-export para que los tests no tengan que importar de dos sitios
export { alcanceVisiblePara } from "@/lib/nucleo/alcance-memoria";
=======
/** Recorre las cápsulas, busca y compone el bloque. Nada de esto sale de aquí si falla. */
async function armarRecuerdos(
  contexto: ContextoCapsulas, textoConsulta: string, opciones: OpcionesRecuerdos,
  buscar: (s: SujetoMemoria, c: string, k: number, f: Date) => Promise<AciertoMemvid[] | null>,
  fin: number,
): Promise<string> {
  try {
    const actor: ActorMemoria = opciones.actor ?? { tipo: "usuario" };
    const fecha = opciones.fecha ?? new Date();
    const fragmentos: FragmentoMemoria[] = [];
    let caracteres = 0;
    for (const capsula of capsulasParaContexto(contexto, actor, fecha)) {
      if (Date.now() >= fin || fragmentos.length >= MAX_FRAGMENTOS || caracteres >= MAX_CARACTERES) break;
      const aciertos = await buscar(capsula.sujeto, textoConsulta, K_CAPSULA, fecha);
      if (aciertos === null) continue; // esa cápsula no llegó a responder: no falla la conversación
      for (const acierto of aciertos) {
        if (fragmentos.length >= MAX_FRAGMENTOS || caracteres >= MAX_CARACTERES) break;
        const texto = typeof acierto.texto === "string" ? acierto.texto.trim() : "";
        if (!texto) continue;
        const quede = MAX_CARACTERES - caracteres;
        const recortado = texto.length > quede ? texto.slice(0, quede) : texto;
        fragmentos.push({
          id: `${capsula.nombre}#${fragmentos.length}`,
          alcance: capsula.alcance,
          texto: recortado,
          origen: typeof acierto.uri === "string" && acierto.uri.length > 0 ? acierto.uri : `cápsula:${capsula.nombre}`,
          at: typeof acierto.ts === "number" ? acierto.ts : 0,
        });
        caracteres += recortado.length;
      }
    }
    let visibles = filtrarParaAlcance(fragmentos, alcanceVisiblePara(actor));
    const personales = visibles.filter((f) => f.alcance === "personal");
    if (opciones.enNube === true) {
      // Antes de salir hacia un modelo de la nube: sin cápsulas personales en el bloque y,
      // como valla final del contrato, detectarFuga contra lo personal de cualquier otra vía.
      visibles = visibles.filter((f) => f.alcance !== "personal");
      if (detectarFuga(visibles.map((f) => f.texto).join("\n"), personales).length > 0) return "";
    }
    if (visibles.length === 0) return "";
    return ["RECUERDOS (cápsulas Memvid):", ...visibles.map((f) => `- ${f.texto}`)].join("\n");
  } catch {
    return "";
  }
}
>>>>>>> 598ba1d88 (salvavidas · MVD1027F-d1: trabajo del agente antes de las puertas (tsc / vitest))
