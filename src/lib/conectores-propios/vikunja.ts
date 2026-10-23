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

function textoValor(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function idDeFila(fila: Record<string, unknown>): string {
  return textoValor(fila.id) || textoValor(fila.projectId) || "";
}

async function buscarProyecto(
  pedir: Pedir,
  base: string,
  token: string,
  titulo: string,
): Promise<{ status: number; data?: unknown; error?: string }> {
  const url = `${base}/projects?title=${encodeURIComponent(titulo)}`;
  let respuesta: { ok: boolean; status: number; text(): Promise<string> };
  let error: string = "";
  try {
    respuesta = await pedir(url, {
      method: "GET",
      headers: { Authorization: token },
    });
  } catch {
    respuesta = { ok: false, status: 0, text: async () => "" };
    error = "Sin conexión a Vikunja.";
  }
  const crudo = await respuesta.text();
  let datos: unknown = null;
  if (crudo.trim()) {
    try {
      datos = JSON.parse(crudo);
    } catch {
      datos = null;
      error = crudo.trim();
    }
  }
  return { status: respuesta.status, data: datos, error };
}

async function crearProyecto(
  pedir: Pedir,
  base: string,
  token: string,
  titulo: string,
): Promise<{ status: number; data?: unknown; error?: string }> {
  const url = `${base}/projects`;
  let respuesta: { ok: boolean; status: number; text(): Promise<string> };
  let error: string = "";
  try {
    respuesta = await pedir(url, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: titulo, owner_id: 0 }),
    });
  } catch {
    respuesta = { ok: false, status: 0, text: async () => "" };
    error = "Sin conexión a Vikunja.";
  }
  const crudo = await respuesta.text();
  let datos: unknown = null;
  if (crudo.trim()) {
    try {
      datos = JSON.parse(crudo);
    } catch {
      datos = null;
      error = crudo.trim();
    }
  }
  return { status: respuesta.status, data: datos, error };
}

export async function asegurarProyecto(
  pedir: Pedir,
  base: string,
  token: string,
  entidad: Entidad,
): Promise<ResultadoProyecto> {
  const titulo = tituloDe(entidad);
  const resultadoBusqueda = await buscarProyecto(pedir, base, token, titulo);

  if (resultadoBusqueda.status === 200 && resultadoBusqueda.data && Array.isArray(resultadoBusqueda.data) && resultadoBusqueda.data.length > 0) {
    const proyecto = resultadoBusqueda.data[0] as Record<string, unknown>;
    const id = idDeFila(proyecto);
    return { ok: true, proyecto: { id, titulo } };
  }

  const resultadoCreacion = await crearProyecto(pedir, base, token, titulo);

  if (resultadoCreacion.status === 409) {
    return {
      ok: false,
      motivo: `ya existe un proyecto con ese título.${resultadoCreacion.status === 409 ? "" : " No se pudo crear uno nuevo."}`,
    };
  }

  if (!resultadoCreacion.data) {
    const mensaje = mapearError(resultadoCreacion.status, resultadoCreacion.error || "", token);
    const motivo = `No se pudo asegurar el proyecto "${tituloDe(entidad)}": ${mensaje}`;
    return { ok: false, motivo };
  }

  const proyecto = resultadoCreacion.data as Record<string, unknown>;
  const id = idDeFila(proyecto);
  return { ok: true, proyecto: { id, titulo } };
}

async function crearTarea(
  pedir: Pedir,
  base: string,
  token: string,
  proyectoId: string,
  titulo: string,
  descripcion: string,
): Promise<{ status: number; data?: unknown; error?: string }> {
  const url = `${base}/projects/${encodeURIComponent(proyectoId)}/tasks`;
  let respuesta: { ok: boolean; status: number; text(): Promise<string> };
  let error: string = "";
  try {
    respuesta = await pedir(url, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: titulo,
        description: descripcion,
        list_id: 0,
        priority: 1,
      }),
    });
  } catch {
    respuesta = { ok: false, status: 0, text: async () => "" };
    error = "Sin conexión a Vikunja.";
  }
  const crudo = await respuesta.text();
  let datos: unknown = null;
  if (crudo.trim()) {
    try {
      datos = JSON.parse(crudo);
    } catch {
      datos = null;
      error = crudo.trim();
    }
  }
  return { status: respuesta.status, data: datos, error };
}

export async function tareaDesdeDecision(
  pedir: Pedir,
  base: string,
  token: string,
  proyectoId: string,
  decision: Decision,
): Promise<ResultadoTarea> {
  const descripcion = `Propuesta ${decision.propuestaId} aprobada el ${decision.aprobadaEn}.${decision.sector ? ` Sector: ${decision.sector}.` : ""}`;
  const resultadoCreacion = await crearTarea(pedir, base, token, proyectoId, decision.titulo, descripcion);
  if (!resultadoCreacion.data) {
    const mensaje = mapearError(resultadoCreacion.status, resultadoCreacion.error || "", token);
    const motivo = `No se pudo crear la tarea "${decision.titulo}" en el proyecto ${proyectoId}: ${mensaje}`;
    return { ok: false, motivo };
  }

  const tarea = resultadoCreacion.data as Record<string, unknown>;
  const id = idDeFila(tarea);
  return { ok: true, tarea: { id, titulo: decision.titulo } };
}

function mapearError(status: number, texto: string, token: string): string {
  if (status === 401) {
    return `Token de Vikunja inválido o ausente.: ${limpiarToken(texto.slice(0, 300), token)}`;
  }
  if (status === 404) return "Error HTTP 404.";
  if (status === 409) return "ya existe un proyecto con ese título.";
  if (status >= 500) return "El servidor Vikunja falló.";
  return `Error HTTP ${status}.`;
}

function limpiarToken(texto: string, token: string): string {
  return token ? texto.split(token).join("«oculto»") : texto;
}
