/**
 * Cliente puro de la API REST de Vikunja v1 (tarea RLB1020H).
 * Vikunja solo EJECUTA lo aprobado en la gobernanza del OS: aquí no se vota.
 * Cada entidad social tiene UN proyecto (no se duplica) y las propuestas
 * aprobadas se convierten en tareas. Sin `fetch` propio ni `node:*`: se inyecta
 * `pedir(url, init)`. Ningún error HTTP lanza; devuelve `{ ok: false, motivo }`.
 */

export type Pedir = (url: string, init?: RequestInit) => Promise<Response>;
export type TipoEntidad = "red" | "grupo" | "comunidad" | "pagina" | "publicacion" | "cerebro" | "personal";
export interface Entidad { tipo: TipoEntidad; id: string; nombre: string }
export interface DecisionAprobada { propuestaId: string; titulo: string; aprobadaEn: string; sector?: string }
export interface ProyectoVikunja { ok: true; id: number; titulo: string; creado: boolean }
export interface TareaVikunja { ok: true; id: number; proyectoId: number }
export interface FalloVikunja { ok: false; motivo: string; estado?: number }
export type ResultadoProyecto = ProyectoVikunja | FalloVikunja;
export type ResultadoTarea = TareaVikunja | FalloVikunja;
export interface ClienteVikunja {
    asegurarProyecto(base: string, token: string, entidad: Entidad): Promise<ResultadoProyecto>;
    tareaDesdeDecision(base: string, token: string, proyectoId: number, decision: DecisionAprobada): Promise<ResultadoTarea>;
}
/** Título canónico y estable: tipo, nombre e id, para no duplicar la entidad. */
export function tituloProyecto(e: Entidad): string {
    return `${e.tipo} · ${e.nombre.trim()} · ${e.id.trim()}`;
}
/** Descripción que enlaza la propuesta y recuerda dónde se decidió. */
export function descripcionTarea(d: DecisionAprobada): string {
    const lineas = [
        `Tarea de ejecución de la propuesta aprobada ${d.propuestaId}.`,
        `Aprobada en la gobernanza del OS el ${d.aprobadaEn}.`,
    ];
    if (d.sector) lineas.push(`Sector: ${d.sector}.`);
    lineas.push("Vikunja ejecuta lo decidido; las decisiones se toman en la gobernanza del OS.");
    return lineas.join("\n");
}
type Respuesta = { ok: true; datos: unknown } | FalloVikunja;
function motivoHttp(estado: number): string {
    if (estado === 401) return "Vikunja rechazó el token (401): revisa la clave del conector en el Hub.";
    if (estado === 403) return "La cuenta de Vikunja no tiene permiso para esta operación (403).";
    if (estado === 404) return "Vikunja no encontró la dirección o el proyecto (404): revisa la base del conector.";
    if (estado === 429) return "Vikunja está limitando las peticiones (429): espera un momento y reinténtalo.";
    return estado >= 500 ? `Vikunja falló en su servidor (${estado}).` : `Vikunja respondió ${estado}.`;
}
const raiz = (base: string): string => base.trim().replace(/\/+$/, "");
const cabeceras = (token: string): Record<string, string> => ({
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
});
function idDe(datos: unknown): number | null {
    const id = datos && typeof datos === "object" ? (datos as Record<string, unknown>).id : null;
    return typeof id === "number" && Number.isFinite(id) ? id : null;
}
function proyectoDe(valor: unknown): { id: number; title: string } | null {
    const p = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : null;
    return p && typeof p.id === "number" && typeof p.title === "string" ? { id: p.id, title: p.title } : null;
}
async function pedirJson(pedir: Pedir, url: string, init: RequestInit): Promise<Respuesta> {
    try {
        const res = await pedir(url, init);
        if (!res.ok) return { ok: false, estado: res.status, motivo: motivoHttp(res.status) };
        if (res.status === 204) return { ok: true, datos: null };
        try { return { ok: true, datos: await res.json() }; }
        catch { return { ok: false, motivo: "Vikunja respondió algo que no es JSON: revisa la dirección base." }; }
    } catch {
        return { ok: false, motivo: "No se pudo contactar con Vikunja: revisa la dirección y la red." };
    }
}
const faltaBase = (base: string): FalloVikunja | null =>
    raiz(base) ? null : { ok: false, motivo: "Falta la dirección del servidor de Vikunja." };
const faltaToken = (token: string): FalloVikunja | null =>
    token.trim() ? null : { ok: false, motivo: "Falta el token de Vikunja: añádelo en el Hub de Conectores." };
export function clienteVikunja(pedir: Pedir): ClienteVikunja {
    return {
        async asegurarProyecto(base, token, entidad) {
            const fallo = faltaBase(base) ?? faltaToken(token);
            if (fallo) return fallo;
            if (!entidad.id.trim() || !entidad.nombre.trim()) {
                return { ok: false, motivo: "La entidad necesita id y nombre para su proyecto." };
            }
            const titulo = tituloProyecto(entidad);
            const listado = await pedirJson(pedir, `${raiz(base)}/projects?per_page=1000`, { method: "GET", headers: cabeceras(token) });
            if (!listado.ok) return listado;
            const existente = (Array.isArray(listado.datos) ? listado.datos : [])
                .map(proyectoDe)
                .find((p) => p?.title === titulo);
            if (existente) return { ok: true, id: existente.id, titulo, creado: false };
            const creado = await pedirJson(pedir, `${raiz(base)}/projects`, { method: "PUT", headers: cabeceras(token), body: JSON.stringify({ title: titulo }) });
            if (!creado.ok) return creado;
            const id = idDe(creado.datos);
            return id === null
                ? { ok: false, motivo: "Vikunja creó el proyecto pero no devolvió su id." }
                : { ok: true, id, titulo, creado: true };
        },
        async tareaDesdeDecision(base, token, proyectoId, decision) {
            const fallo = faltaBase(base) ?? faltaToken(token);
            if (fallo) return fallo;
            if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
                return { ok: false, motivo: "El proyecto de Vikunja no es válido." };
            }
            if (!decision.propuestaId.trim() || !decision.titulo.trim() || !decision.aprobadaEn.trim()) {
                return { ok: false, motivo: "La decisión necesita propuesta, título y fecha de aprobación." };
            }
            const tarea = await pedirJson(pedir, `${raiz(base)}/projects/${proyectoId}/tasks`, { method: "PUT", headers: cabeceras(token), body: JSON.stringify({ title: decision.titulo.trim(), description: descripcionTarea(decision) }) });
            if (!tarea.ok) return tarea;
            const id = idDe(tarea.datos);
            return id === null
                ? { ok: false, motivo: "Vikunja creó la tarea pero no devolvió su id." }
                : { ok: true, id, proyectoId };
        },
    };
}
