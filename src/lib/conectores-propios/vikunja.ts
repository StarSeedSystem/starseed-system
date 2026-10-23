/**
 * Vikunja · cliente puro (RLB1020H).
 *
 * Habla la API REST de Vikunja v1. No importa `node:*` ni hace red por
 * su cuenta: `pedir` entra inyectado para que la misma lógica corra en el cliente
 * o en una ruta. Errores HTTP → resultado {ok:false, motivo} legible, nunca excepción.
 *
 * Contenido = entidad única: al compartir se referencia, no se duplica.
 */

type Pedir = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface Entidad {
  tipo: "red" | "grupo" | "comunidad" | "pagina" | "publicacion" | "cerebro" | "personal";
  id: string;
  nombre: string;
}

export interface ProcesoId {
  id: string;
}

export interface Decision {
  propuestaId: string;
  titulo: string;
  aprobadaEn: string;
  sector?: string;
}

export interface ResultadoProyecto {
  ok: boolean;
  proyecto?: { id: string; titulo: string };
  motivo?: string;
}

export interface ResultadoTarea {
  ok: boolean;
  tarea?: { id: string; titulo: string };
  motivo?: string;
}

function tituloDe(base: Entidad): string {
  return `${base.tipo} · ${base.nombre} · ${base.id}`;
}

function mapearError(status: number, texto: string): string {
  if (status === 401) return "Token de Vikunja inválido o ausente.";
  if (status === 404) return "Entidad Vikunja no encontrada.";
  if (status === 409) return "Ya existe un proyecto con ese título.";
  if (status >= 500) return "El servidor Vikunja falló.";
  return `Error HTTP ${status}.`;
}

async function buscarProyecto(
  pedir: Pedir,
  base: string,
  token: string,
  titulo: string,
): Promise<unknown> {
  const url = `${base}/projects?title=${encodeURIComponent(titulo)}`;
  const respuesta = await pedir(url, {
    method: "GET",
    headers: { Authorization: token },
  });
  if (!respuesta.ok) {
    return null;
  }
  const crudo = await respuesta.text();
  if (!crudo.trim()) return null;
  try {
    return JSON.parse(crudo);
  } catch {
    return null;
  }
}

async function crearProyecto(
  pedir: Pedir,
  base: string,
  token: string,
  titulo: string,
): Promise<unknown> {
  const url = `${base}/projects`;
  const cuerpo = JSON.stringify({ title: titulo, owner_id: 0 });
  const respuesta = await pedir(url, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: cuerpo,
  });
  if (!respuesta.ok) {
    return null;
  }
  const crudo = await respuesta.text();
  if (!crudo.trim()) return null;
  try {
    return JSON.parse(crudo);
  } catch {
    return null;
  }
}

export async function asegurarProyecto(
  pedir: Pedir,
  base: string,
  token: string,
  entidad: Entidad,
): Promise<ResultadoProyecto> {
  const titulo = tituloDe(entidad);
  const encontrado = await buscarProyecto(pedir, base, token, titulo);

  if (encontrado && Array.isArray(encontrado) && encontrado.length > 0) {
    const proyecto = encontrado[0] as Record<string, unknown>;
    const id = String(proyecto.id || proyecto.projectId || "");
    return { ok: true, proyecto: { id, titulo } };
  }

  const creado = await crearProyecto(pedir, base, token, titulo);
  if (!creado) {
    return {
      ok: false,
      motivo: `No se pudo asegurar el proyecto "${tituloDe(entidad)}".`,
    };
  }

  const proj = creado as Record<string, unknown>;
  const id = String(proj.id || proj.projectId || "");
  return { ok: true, proyecto: { id, titulo } };
}

async function crearTarea(
  pedir: Pedir,
  base: string,
  token: string,
  proyectoId: string,
  titulo: string,
  descripcion: string,
): Promise<unknown> {
  const url = `${base}/projects/${encodeURIComponent(proyectoId)}/tasks`;
  const cuerpo = JSON.stringify({
    title: titulo,
    description: descripcion,
    list_id: 0,
    priority: 1,
  });
  const respuesta = await pedir(url, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: cuerpo,
  });
  if (!respuesta.ok) {
    return null;
  }
  const crudo = await respuesta.text();
  if (!crudo.trim()) return null;
  try {
    return JSON.parse(crudo);
  } catch {
    return null;
  }
}

export async function tareaDesdeDecision(
  pedir: Pedir,
  base: string,
  token: string,
  proyectoId: string,
  decision: Decision,
): Promise<ResultadoTarea> {
  const descripcion = `Propuesta ${decision.propuestaId} aprobada el ${decision.aprobadaEn}.${decision.sector ? ` Sector: ${decision.sector}.` : ""}`;
  const tareaCreada = await crearTarea(pedir, base, token, proyectoId, decision.titulo, descripcion);
  if (!tareaCreada) {
    return {
      ok: false,
      motivo: `No se pudo crear la tarea "${decision.titulo}" en el proyecto ${proyectoId}.`,
    };
  }

  const tarea = tareaCreada as Record<string, unknown>;
  const id = String(tarea.id || tarea.taskId || "");
  return { ok: true, tarea: { id, titulo: decision.titulo } };
}
