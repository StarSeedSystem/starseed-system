import { Tarea, EstadoTarea } from "./tipos";

export type EstadoVerif = readonly VerificacionCriterio[];
export interface VerificacionCriterio {
  criterio: string;
  por: { tipo: "persona" | "bot" | "pruebas"; id: string };
  ok: boolean;
  evidencia?: string;
}
function hash(str: string): number { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i); return h >>> 0; }

export function crearTarea(
  args: { titulo: string; criterios: string[] | string },
  director: string,
  origen: "genesis" | "poligenesis"
): Tarea | { problemas: string[] } {
  let criterios: string[];
  if (typeof args.criterios === "string") {
    try {
      const parsed = JSON.parse(args.criterios);
      if (!Array.isArray(parsed)) return { problemas: ["criterios debe ser un array o un JSON que parsee a array"] };
      criterios = parsed.map((c) => String(c));
    } catch { return { problemas: ["criterios no es un JSON válido"] }; }
  } else criterios = args.criterios;

  if (criterios.length === 0) return { problemas: ["sin criterios no hay tarea"] };
  if (criterios.length > 12) return { problemas: ["máximo 12 criterios permitidos"] };
  for (const c of criterios) if (c.length > 200) return { problemas: [`criterio demasiado largo: "${c.substring(0, 50)}..."`] };

  const sorted = [...criterios].sort();
  const contenido = JSON.stringify({ titulo: args.titulo, criterios: sorted, director, origen });
  const id = hash(contenido).toString(16);

  return {
    id,
    titulo: args.titulo,
    director,
    agentes: [],
    criterios,
    verificador: "persona",
    origen,
    estado: "propuesta",
  };
}

export function asignarPasos(
  tarea: Tarea,
  agentes: readonly { id: string; capacidades: string[] }[]
): Tarea {
  if (agentes.length === 0) return { ...tarea, agentes: [] };

  const agentesOrdenados = [...agentes].sort((a, b) => a.id.localeCompare(b.id));
  const directorEnAgentes = agentesOrdenados.some((ag) => ag.id === tarea.director);
  const trabajadores = agentesOrdenados.filter((ag) => ag.id !== tarea.director);
  const directorAgente = directorEnAgentes ? agentesOrdenados.find((ag) => ag.id === tarea.director) : undefined;
  const asignaciones = new Map<string, string[]>();
  agentesOrdenados.forEach((ag) => asignaciones.set(ag.id, []));

  for (const criterio of tarea.criterios) {
    const palabras = criterio.split(/[\s,.;:_\-]+/).filter((p) => p.length > 0);
    let agenteSeleccionado: string | null = null;
    for (const trabajador of trabajadores) {
      if (trabajador.capacidades.some((cap) => palabras.includes(cap))) {
        agenteSeleccionado = trabajador.id;
        break;
      }
    }
    if (!agenteSeleccionado && directorAgente) {
      if (directorAgente.capacidades.some((cap) => palabras.includes(cap))) agenteSeleccionado = directorAgente.id;
    }
    if (!agenteSeleccionado) {
      if (trabajadores.length > 0) agenteSeleccionado = trabajadores[0].id;
      else agenteSeleccionado = agentesOrdenados[0].id;
    }
    const current = asignaciones.get(agenteSeleccionado) || [];
    asignaciones.set(agenteSeleccionado, [...current, criterio]);
  }

  const agentesConTrabajo = agentesOrdenados
    .filter((ag) => asignaciones.get(ag.id).length > 0)
    .map((ag) => ag.id);
  if (agentesConTrabajo.length === 0 && tarea.criterios.length > 0)
    return { ...tarea, agentes: [agentesOrdenados[0].id] };
  return { ...tarea, agentes: agentesConTrabajo };
}

export function marcarCriterio(
  estadoVerif: EstadoVerif,
  criterio: string,
  por: { tipo: "persona" | "bot" | "pruebas"; id: string },
  ok: boolean,
  evidencia?: string
): EstadoVerif {
  const nueva: VerificacionCriterio = { criterio, por, ok, evidencia: evidencia ?? undefined };
  return [...estadoVerif.filter((v) => v.criterio !== criterio), nueva] as EstadoVerif;
}

export function estadoDe(tarea: Tarea, verif: EstadoVerif): EstadoTarea {
  if (verif.length === 0 && tarea.agentes.length === 0) return "propuesta";
  if (verif.length > 0) {
    const todosOk = tarea.criterios.every((c) => {
      const verifs = verif.filter((v) => v.criterio === c).reverse();
      return verifs.some((v) => v.ok && esValido(v.por, tarea));
    });
    return todosOk ? "hecha" : "verificando";
  }
  if (tarea.agentes.length > 0) return "en-curso";
  return "propuesta";
}

function esValido(
  por: VerificacionCriterio["por"],
  tarea: Tarea
): boolean {
  if (por.tipo === "persona" || por.tipo === "pruebas") return true;
  if (por.tipo === "bot") return por.id !== tarea.director;
  return false;
}