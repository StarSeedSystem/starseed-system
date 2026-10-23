/**
 * Vikunja · cliente puro de la API REST v1 (RLB1020Hb).
 *
 * Un proyecto por red, grupo, comunidad, página, publicación o cerebro, y tareas
 * creadas SOLO desde decisiones ya aprobadas en la gobernanza del OS: las
 * decisiones democráticas no se toman en Vikunja. No importa `node:*` ni hace
 * red por su cuenta: `pedir` entra inyectado. Nunca lanza: devuelve {ok, motivo}.
 * El token viaja solo en la cabecera `Authorization`; nunca en URL ni en motivos.
 */

export interface RespuestaVikunja {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type Pedir = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<RespuestaVikunja>;

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
  | { ok: true; proyecto: { id: number; titulo: string }; creado: boolean }
  | { ok: false; motivo: string };

export type ResultadoTarea =
  | { ok: true; tarea: { id: number; titulo: string } }
  | { ok: false; motivo: string };

export function tituloProyecto(e: Entidad): string {
  return `${e.tipo} · ${e.nombre} · ${e.id}`;
}

function raiz(base: string): string {
  const limpia = base.trim().replace(/\/+$/, "");
  return /\/api\/v1$/i.test(limpia) ? limpia : `${limpia}/api/v1`;
}

function motivoHttp(status: number, token: string, cuerpo: string): string {
  if (status === 401 || status === 403) return "Vikunja rechazó el token: es inválido, ha caducado o no tiene permiso.";
  if (status === 404) return "Vikunja no encontró el recurso (revisa la dirección o el proyecto).";
  if (status >= 500) return `El servidor Vikunja falló (HTTP ${status}).`;
  const pista = cuerpo.split(token || "\u0000").join("«oculto»").slice(0, 160);
  return `Vikunja respondió HTTP ${status}${pista ? `: ${pista}` : ""}.`;
}

async function llamar(
  pedir: Pedir,
  token: string,
  method: string,
  url: string,
  cuerpo?: unknown,
): Promise<{ ok: true; datos: unknown } | { ok: false; motivo: string }> {
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
    const r = await pedir(url, { method, headers, ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}) });
    const crudo = await r.text();
    if (!r.ok) return { ok: false, motivo: motivoHttp(r.status, token, crudo) };
    try {
      return { ok: true, datos: crudo.trim() ? JSON.parse(crudo) : null };
    } catch {
      return { ok: false, motivo: "Vikunja devolvió una respuesta que no es JSON." };
    }
  } catch {
    return { ok: false, motivo: "No se pudo conectar con Vikunja." };
  }
}

function filaConId(datos: unknown): { id: number; title: string } | null {
  if (!datos || typeof datos !== "object") return null;
  const f = datos as { id?: unknown; title?: unknown };
  return typeof f.id === "number" ? { id: f.id, title: typeof f.title === "string" ? f.title : "" } : null;
}

export async function asegurarProyecto(
  base: string,
  token: string,
  entidad: Entidad,
  pedir: Pedir,
): Promise<ResultadoProyecto> {
  const titulo = tituloProyecto(entidad);
  const api = raiz(base);
  const busca = await llamar(pedir, token, "GET", `${api}/projects?s=${encodeURIComponent(titulo)}`);
  if (!busca.ok) return { ok: false, motivo: busca.motivo };
  const hallado = Array.isArray(busca.datos)
    ? busca.datos.map(filaConId).find((f) => f !== null && f.title === titulo)
    : null;
  if (hallado) return { ok: true, proyecto: { id: hallado.id, titulo }, creado: false };
  const crea = await llamar(pedir, token, "PUT", `${api}/projects`, { title: titulo });
  if (!crea.ok) return { ok: false, motivo: crea.motivo };
  const fila = filaConId(crea.datos);
  return fila
    ? { ok: true, proyecto: { id: fila.id, titulo }, creado: true }
    : { ok: false, motivo: "Vikunja no devolvió el identificador del proyecto creado." };
}

export async function tareaDesdeDecision(
  base: string,
  token: string,
  proyectoId: number,
  decision: Decision,
  pedir: Pedir,
): Promise<ResultadoTarea> {
  const descripcion =
    `Ejecuta la propuesta ${decision.propuestaId}, aprobada en la gobernanza del OS el ${decision.aprobadaEn}.` +
    `${decision.sector ? ` Sector: ${decision.sector}.` : ""} Esta tarea no decide nada: solo ejecuta lo ya aprobado.`;
  const r = await llamar(pedir, token, "PUT", `${raiz(base)}/projects/${proyectoId}/tasks`, {
    title: decision.titulo,
    description: descripcion,
  });
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const fila = filaConId(r.datos);
  return fila
    ? { ok: true, tarea: { id: fila.id, titulo: decision.titulo } }
    : { ok: false, motivo: "Vikunja no devolvió el identificador de la tarea creada." };
}
