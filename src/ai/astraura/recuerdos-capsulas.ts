// Recuerdos de las cápsulas Memvid antes de responder en Astraura (MVD1027F).
// Contrato: architecture/memvid-capsulas.md §3 — busca en las cápsulas del contexto
// (cercana → general) y devuelve el bloque «RECUERDOS (cápsulas Memvid):» o "".
import {
  alcanceVisiblePara, detectarFuga, filtrarParaAlcance,
  type ActorMemoria, type FragmentoMemoria,
} from "@/lib/nucleo/alcance-memoria";
import {
  capsulasParaContexto, type CapsulaMemoria, type ContextoCapsulas, type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import { buscar as buscarMemvid, type AciertoMemvid } from "@/lib/memorias/memvid-cliente";

/** Contexto del chat (perfil, personalidad, agente, página, grupo, cerebro) + quién pregunta y
 * si el modelo elegido sale de la máquina (entonces lo personal no viaja a la nube). */
export interface ContextoRecuerdos extends ContextoCapsulas {
  actor: ActorMemoria;
  esNube?: boolean;
}
/** Cliente de búsqueda intercambiable: el real es `buscar` de `memvid-cliente`. */
export type BuscadorCapsulas = (sujeto: SujetoMemoria, consulta: string, k: number) => Promise<AciertoMemvid[] | null>;

export interface OpcionesRecordar {
  /** `fecha` y `buscar` existen para las pruebas con el cliente falso. */
  fecha?: Date;
  buscar?: BuscadorCapsulas;
  topeMs?: number;
  k?: number;
  max?: number;
  maxCaracteres?: number;
}

export const K_DEFECTO = 4;
export const MAX_RECUERDOS = 6, MAX_CARACTERES = 1500, TOPE_TOTAL_MS = 800;

/** Un acierto de Memvid se vuelve FragmentoMemoria con el alcance de SU cápsula. */
export function aFragmento(capsula: CapsulaMemoria, acierto: AciertoMemvid, fecha: Date, indice: number): FragmentoMemoria {
  const texto = typeof acierto?.texto === "string" ? acierto.texto.trim() : "";
  return {
    id: `${capsula.nombre}:${indice}`,
    alcance: capsula.alcance,
    texto,
    origen: typeof acierto.uri === "string" && acierto.uri.length > 0 ? acierto.uri : capsula.nombre,
    at: typeof acierto.ts === "number" ? acierto.ts * 1000 : fecha.getTime(),
  };
}

/** Recorta la lista: el primero entra siempre, hasta `max` y `maxCaracteres`. */
export function limitarRecuerdos(frs: FragmentoMemoria[], max = MAX_RECUERDOS, maxCaracteres = MAX_CARACTERES): FragmentoMemoria[] {
  const salida: FragmentoMemoria[] = [];
  let usados = 0;
  for (const fr of frs) {
    if (!fr.texto || salida.length >= max) break;
    if (salida.length > 0 && usados + fr.texto.length > maxCaracteres) break;
    salida.push(fr);
    usados += fr.texto.length;
  }
  return salida;
}

/** El bloque que entra al system prompt. Vacío → "", nunca un título suelto. */
export function componerBloque(frs: FragmentoMemoria[]): string {
  if (frs.length === 0) return "";
  const lineas = frs.map((fr) => `- ${fr.texto}${fr.origen ? ` (${fr.origen})` : ""}`);
  return `RECUERDOS (cápsulas Memvid):\n${lineas.join("\n")}`;
}

/** Relevo para un modelo de la nube: lo personal SIEMPRE se queda; `detectarFuga` es la red. */
export function limpiarParaNube(frs: FragmentoMemoria[]): FragmentoMemoria[] {
  const personales = frs.filter((fr) => fr.alcance === "personal");
  if (personales.length === 0) return frs;
  const sinPersonales = frs.filter((fr) => fr.alcance !== "personal");
  const bloque = componerBloque(sinPersonales);
  return detectarFuga(bloque, personales).length > 0 ? [] : sinPersonales;
}

/** Busca cápsula por cápsula (cercana → general), para por tope de recuerdos, letras o reloj. */
async function recopilar(estado: ContextoRecuerdos, consulta: string, opciones: OpcionesRecordar): Promise<string> {
  const fecha = opciones.fecha ?? new Date();
  const fin = Date.now() + (opciones.topeMs ?? TOPE_TOTAL_MS), buscar = opciones.buscar ?? buscarMemvid;
  const max = opciones.max ?? MAX_RECUERDOS, maxCaracteres = opciones.maxCaracteres ?? MAX_CARACTERES;
  const capsulas = capsulasParaContexto(estado, estado.actor, fecha);
  const recogidos: FragmentoMemoria[] = [];
  let usados = 0;
  for (const capsula of capsulas) {
    if (recogidos.length >= max || usados >= maxCaracteres || Date.now() >= fin) break;
    try {
      const aciertos = await buscar(
        { tipo: capsula.sujeto.tipo, id: capsula.sujeto.id, grupoId: undefined }, consulta,
        opciones.k ?? K_DEFECTO,
      );
      if (!Array.isArray(aciertos)) continue;
      for (const acierto of aciertos) {
        const fr = aFragmento(capsula, acierto, fecha, recogidos.length);
        if (!fr.texto) continue;
        if (recogidos.length >= max) break;
        // Como en `fundirRecuerdos`: el primero entra siempre y el resto hay que caberlo.
        if (recogidos.length > 0 && usados + fr.texto.length > maxCaracteres) break;
        recogidos.push(fr);
        usados += fr.texto.length;
      }
    } catch { /* cápsula que falla no tumba el resto ni la respuesta */ }
  }
  const visibles = filtrarParaAlcance(recogidos, alcanceVisiblePara(estado.actor));
  const finales = limitarRecuerdos(estado.esNube ? limpiarParaNube(visibles) : visibles, max, maxCaracteres);
  return componerBloque(finales);
}

/** Punto de entrada (la parte que cablea el router llamará aquí junto a `chatCfgNote`):
 * Promise.race contra el tope total (800 ms), así una cápsula colgada no retrasa a Aurora. */
export async function recordarDeCapsulas(
  estado: ContextoRecuerdos, consulta: string, opciones: OpcionesRecordar = {},
): Promise<string> {
  if (typeof consulta !== "string" || consulta.trim().length === 0) return "";
  let retirarCampeon: () => void = () => undefined;
  const campeon = new Promise<string>((r) => { retirarCampeon = () => r(""); });
  const token = setTimeout(retirarCampeon, opciones.topeMs ?? TOPE_TOTAL_MS);
  try {
    return await Promise.race([recopilar(estado, consulta, opciones), campeon]);
  } catch { return ""; } finally { clearTimeout(token); }
}
