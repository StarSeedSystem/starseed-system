export const CLAVE_ESPACIO = "espacio";

export type Visibilidad = "publica" | "entidad" | "roles" | "privada";
export type AccesoPublico = "ver" | "ninguno";

export interface Pestana {
    id: string;
    titulo: string;
    tipo: string;
    sesionId: string;
    visibilidad: Visibilidad;
    roles?: string[];
    accesoPublico: AccesoPublico;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISIBILIDADES_VALIDAS: Visibilidad[] = ["publica", "entidad", "roles", "privada"];
const MAX_PESTANAS = 24;
const MAX_TITULO = 60;
const MAX_ROLES = 8;
const MAX_ROLE_LENGTH = 30;

function esUUID(val: unknown): val is string {
    return typeof val === "string" && UUID_RE.test(val);
}

function esVisibilidadValida(val: unknown): val is Visibilidad {
    return typeof val === "string" && VISIBILIDADES_VALIDAS.includes(val as Visibilidad);
}

function sanearTitulo(titulo: unknown): string {
    const t = typeof titulo === "string" ? titulo.trim() : "";
    if (t.length === 0) return "Sin título";
    return t.slice(0, MAX_TITULO);
}

function sanearRoles(roles: unknown, visibilidad: Visibilidad): string[] | undefined {
    if (visibilidad !== "roles") return undefined;
    if (!Array.isArray(roles)) return undefined;
    const validos = roles
        .filter((r): r is string => typeof r === "string" && r.length > 0)
        .map((r) => r.slice(0, MAX_ROLE_LENGTH))
        .slice(0, MAX_ROLES);
    return validos.length > 0 ? validos : undefined;
}

function determinarAccesoPublico(visibilidad: Visibilidad, acceso: unknown): AccesoPublico {
    if (visibilidad !== "publica") return "ninguno";
    return acceso === "ver" ? "ver" : "ver";
}

export function normalizarEspacio(raw: unknown): Pestana[] {
    if (!Array.isArray(raw)) return [];

    const vistos = new Set<string>();
    const resultado: Pestana[] = [];

    for (const item of raw) {
        if (resultado.length >= MAX_PESTANAS) break;
        if (!item || typeof item !== "object") continue;

        const obj = item as Record<string, unknown>;

        const id = typeof obj.id === "string" ? obj.id : undefined;
        if (!id || vistos.has(id)) continue;

        const sesionId = obj.sesionId;
        if (!esUUID(sesionId)) continue;

        if (!("titulo" in obj)) continue;
        const tituloRaw = typeof obj.titulo === "string" ? obj.titulo.trim() : "";
        const titulo = tituloRaw.length === 0 ? "Sin título" : tituloRaw.slice(0, MAX_TITULO);

        const tipo = typeof obj.tipo === "string" && obj.tipo.length > 0 ? obj.tipo : "pizarra";
        const visibilidad = esVisibilidadValida(obj.visibilidad) ? obj.visibilidad : "privada";
        const accesoPublico = determinarAccesoPublico(visibilidad, obj.accesoPublico);
        const roles = sanearRoles(obj.roles, visibilidad);

        vistos.add(id);
        resultado.push({ id, titulo, tipo, sesionId, visibilidad, roles, accesoPublico });
    }

    return resultado;
}

export function anadirPestana(lista: Pestana[], p: Pestana): Pestana[] {
    if (lista.length >= MAX_PESTANAS) return [...lista];
    if (lista.some((item) => item.id === p.id)) return [...lista];
    return [...lista, p];
}

export function quitarPestana(lista: Pestana[], id: string): Pestana[] {
    return lista.filter((item) => item.id !== id);
}