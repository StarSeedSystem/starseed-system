/**
 * Vikunja · cliente puro de la API REST v1 (RLB1020Hb).
 *
 * Un proyecto por red, grupo, comunidad, página, publicación, cerebro o
 * persona; las tareas salen SOLO de lo ya aprobado en la gobernanza del OS:
 * las decisiones democráticas no se toman en Vikunja. No importa `node:*` ni
 * hace red por su cuenta: `pedir` entra inyectado. El token viaja solo en la
 * cabecera `Authorization` y nunca aparece en un motivo de error.
 */
import type { Pedir, RespuestaEtapi } from "./trilium";

export type { Pedir, RespuestaEtapi };

export interface Entidad {
  tipo: "red" | "grupo" | "comunidad" | "pagina" | "publicacion" | "cerebro" | "personal";
  id: string;
  nombre: string;
}

export interface Decision {
  propuestaId: string;
  titulo: string;
  aprobadaEn: string;
  sector?: string;
}

export type ResultadoProyecto =
  | { ok: true; proyecto: { id: string; titulo: string }; creado: boolean }
  | { ok: false; motivo: string };

export type ResultadoTarea =
  | { ok: true; tarea: { id: string; titulo: string } }
  | { ok: false; motivo: string };

type Llamada = { ok: true; datos: unknown } | { ok: false; motivo: string };

export function tituloProyecto(e: Entidad): string {
  return `${e.tipo} · ${e.nombre} · ${e.id}`;
}

function motivoHttp(status: number): string {
  if (status === 401 || status === 403) return "Vikunja rechazó el token (401/403): revisa que sea válido y tenga permisos.";
  if (status === 404) return "Vikunja no encontró el recurso (404): revisa la dirección base y el proyecto.";
  if (status === 429) return "Vikunja limita las peticiones (429): reintenta más tarde.";
  if (status >= 500) return `El servidor de Vikunja falló (${status}).`;
  return `Vikunja respondió con error HTTP ${status}.`;
}

async function llamar(pedir: Pedir, token: string, method: string, url: string, cuerpo?: unknown): Promise<Llamada> {
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
    if (cuerpo !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(cuerpo);
    }
    const r = await pedir(url, init);
    if (!r.ok) return { ok: false, motivo: motivoHttp(r.status) };
    const crudo = await r.text();
    return { ok: true, datos: crudo.trim() ? JSON.parse(crudo) : null };
  } catch {
    return { ok: false, motivo: "No se pudo hablar con Vikunja (sin conexión o respuesta no válida)." };
  }
}

function idDe(fila: unknown): string | null {
  if (typeof fila !== "object" || fila === null) return null;
  const id = (fila as { id?: unknown }).id;
  return typeof id === "number" || typeof id === "string" ? String(id) : null;
}

/** Busca el proyecto por título exacto; si no existe lo crea (PUT /projects). */
export async function asegurarProyecto(
  base: string,
  token: string,
  entidad: Entidad,
  pedir: Pedir,
): Promise<ResultadoProyecto> {
  const raiz = base.replace(/\/+$/, "");
  const titulo = tituloProyecto(entidad);
  const hallado = await llamar(pedir, token, "GET", `${raiz}/projects?s=${encodeURIComponent(titulo)}`);
  if (!hallado.ok) return hallado;
  if (Array.isArray(hallado.datos)) {
    const fila = hallado.datos.find((p) => (p as { title?: unknown })?.title === titulo);
    const id = idDe(fila);
    if (id) return { ok: true, proyecto: { id, titulo }, creado: false };
  }
  const nuevo = await llamar(pedir, token, "PUT", `${raiz}/projects`, { title: titulo });
  if (!nuevo.ok) return nuevo;
  const id = idDe(nuevo.datos);
  if (!id) return { ok: false, motivo: "Vikunja creó el proyecto pero no devolvió su id." };
  return { ok: true, proyecto: { id, titulo }, creado: true };
}

/** Crea la tarea (PUT /projects/{id}/tasks) de una propuesta ya aprobada en el OS. */
export async function tareaDesdeDecision(
  base: string,
  token: string,
  proyectoId: string,
  decision: Decision,
  pedir: Pedir,
): Promise<ResultadoTarea> {
  const raiz = base.replace(/\/+$/, "");
  const sector = decision.sector ? ` Sector: ${decision.sector}.` : "";
  const description =
    `Ejecución de la propuesta ${decision.propuestaId}, aprobada en la gobernanza del OS el ${decision.aprobadaEn}.` +
    `${sector} Enlace: /network/politics?propuesta=${encodeURIComponent(decision.propuestaId)}. ` +
    "Las decisiones no se toman aquí.";
  const url = `${raiz}/projects/${encodeURIComponent(proyectoId)}/tasks`;
  const r = await llamar(pedir, token, "PUT", url, { title: decision.titulo, description });
  if (!r.ok) return r;
  const id = idDe(r.datos);
  if (!id) return { ok: false, motivo: "Vikunja creó la tarea pero no devolvió su id." };
  return { ok: true, tarea: { id, titulo: decision.titulo } };
}
