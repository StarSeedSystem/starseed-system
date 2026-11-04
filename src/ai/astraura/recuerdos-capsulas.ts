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
  } finally {
    clearTimeout(temporizador);
  }
}

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
