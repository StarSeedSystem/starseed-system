/**
 * Vikunja · cliente puro de la API REST v1 (RLB1020H).
 *
 * Un proyecto por red, grupo, comunidad, página, publicación o cerebro; las
 * tareas salen SOLO de lo ya aprobado en la gobernanza del OS: Vikunja ejecuta,
 * no decide. No importa `node:*` ni hace red por su cuenta: `pedir` entra
 * inyectado. El token viaja solo en la cabecera `Authorization`; nunca en la
 * URL ni en un mensaje de error. Errores → {ok:false, motivo}, nunca excepción.
 */

export interface RespuestaHttp {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type Pedir = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<RespuestaHttp>;

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

export type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string };
export type ResultadoProyecto = Resultado<{ proyecto: { id: string; titulo: string } }>;
export type ResultadoTarea = Resultado<{ tarea: { id: string; titulo: string } }>;

export const tituloDeProyecto = (e: Entidad): string => `${e.tipo} · ${e.nombre} · ${e.id}`;

type Lectura = { ok: true; datos: unknown } | { ok: false; motivo: string };

function motivoHttp(status: number): string {
  if (status === 401 || status === 403) return "Vikunja rechazó el token (401/403): revisa que sea válido y tenga permisos.";
  if (status === 404) return "Vikunja respondió 404: la dirección base o el recurso no existen.";
  if (status >= 500) return `Vikunja falló (HTTP ${status}).`;
  return `Vikunja respondió HTTP ${status}.`;
}

async function llamar(pedir: Pedir, base: string, token: string, metodo: string, ruta: string, cuerpo?: unknown): Promise<Lectura> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  try {
    const r = await pedir(`${base.replace(/\/+$/, "")}${ruta}`, {
      method: metodo,
      headers,
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
    if (!r.ok) return { ok: false, motivo: motivoHttp(r.status) };
    const crudo = await r.text();
    return { ok: true, datos: crudo.trim() ? JSON.parse(crudo) : null };
  } catch {
    return { ok: false, motivo: "No se pudo hablar con Vikunja (sin conexión o respuesta ilegible)." };
  }
}

function filaConId(valor: unknown): { id: string; title: string } | null {
  if (typeof valor !== "object" || valor === null) return null;
  const f = valor as { id?: unknown; title?: unknown };
  if ((typeof f.id !== "number" && typeof f.id !== "string") || typeof f.title !== "string") return null;
  return { id: String(f.id), title: f.title };
}

export async function asegurarProyecto(pedir: Pedir, base: string, token: string, entidad: Entidad): Promise<ResultadoProyecto> {
  const titulo = tituloDeProyecto(entidad);
  const hallados = await llamar(pedir, base, token, "GET", `/projects?s=${encodeURIComponent(titulo)}`);
  if (!hallados.ok) return hallados;
  if (Array.isArray(hallados.datos)) {
    for (const fila of hallados.datos) {
      const p = filaConId(fila);
      if (p && p.title === titulo) return { ok: true, proyecto: { id: p.id, titulo } };
    }
  }
  const creado = await llamar(pedir, base, token, "PUT", "/projects", { title: titulo });
  if (!creado.ok) return creado;
  const p = filaConId(creado.datos);
  return p ? { ok: true, proyecto: { id: p.id, titulo } } : { ok: false, motivo: "Vikunja creó el proyecto pero no devolvió su id." };
}

export async function tareaDesdeDecision(pedir: Pedir, base: string, token: string, proyectoId: string, decision: Decision): Promise<ResultadoTarea> {
  const descripcion =
    `Ejecuta la propuesta ${decision.propuestaId}, aprobada en la gobernanza de StarSeed OS el ${decision.aprobadaEn}.` +
    `${decision.sector ? ` Sector: ${decision.sector}.` : ""} La decisión no se reabre aquí.`;
  const creada = await llamar(pedir, base, token, "PUT", `/projects/${encodeURIComponent(proyectoId)}/tasks`, {
    title: decision.titulo,
    description: descripcion,
  });
  if (!creada.ok) return creada;
  const t = filaConId(creada.datos);
  return t ? { ok: true, tarea: { id: t.id, titulo: decision.titulo } } : { ok: false, motivo: "Vikunja creó la tarea pero no devolvió su id." };
}
