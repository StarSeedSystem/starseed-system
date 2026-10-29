/** Ruta MCP remota de Genesis por ámbito (GCA1019S). PURO: dependencias inyectadas. */
import { atenderMcp } from "./protocolo";
import type { FichaHerramientaMcp, PermisoMcp } from "./herramientas";
import type { CapacidadAmbito } from "../../mando/ambito";
export interface IdentidadRuta { ambito: string; alcance: readonly string[]; huella: string; creadoPor: string | null; usos: number; limiteUsos: number | null }
export type ResultadoIdentidad =
  | { ok: true; identidad: IdentidadRuta } | { ok: false; respuesta: Response };
export interface RegistroLlamada { ambito_id: string; tipo: string; endpoint: string; metodo: string; status_code: number; respuesta_tiempo_ms: number; creado_por: string | null }
export interface DependenciasRutaMcp { herramientas: readonly FichaHerramientaMcp[]; ahora: () => number; identificar: (req: Request) => Promise<ResultadoIdentidad>; registrar: (registro: RegistroLlamada) => Promise<void>; contarUso: (huella: string) => Promise<void>; permitirRafaga: (huella: string) => boolean }
export const MAX_CUERPO_MCP = 64 * 1024;
export function leerBearer(cabecera: string | null): string | null {
  const m = /^Bearer\s+(.+)$/i.exec((cabecera ?? "").trim());
  return m?.[1]?.trim() || null;
}
const PERMISOS_POR_CAPACIDAD: Partial<Record<CapacidadAmbito, readonly PermisoMcp[]>> = {
  "ver-resumen": ["estado:leer", "tareas:listar", "agentes:listar", "medidores:leer"],
  "ver-detalle": ["estado:leer", "tareas:listar", "agentes:listar", "medidores:leer", "biblioteca:buscar", "opciones:sugerir"],
  chatear: ["chat:enviar"], encolar: ["tareas:crear"], aprobar: ["operaciones:proponer"], "lanzar-olas": ["operaciones:proponer"],
  "usar-apis": ["opciones:sugerir", "biblioteca:buscar"], "gestionar-accesos": ["estado:leer", "tareas:listar", "agentes:listar", "medidores:leer"],
};
export function permisoConcedido(permiso: PermisoMcp, alcance: readonly string[]): boolean {
  if (alcance.length === 0) return false;
  if (alcance.includes("*") || alcance.includes("administrar") || alcance.includes(permiso)) return true;
  if (alcance.includes(`${permiso.split(":")[0]}:*`)) return true;
  return alcance.some((c) => (PERMISOS_POR_CAPACIDAD[c as CapacidadAmbito] ?? []).includes(permiso));
}
export function filtrarHerramientas(
  herramientas: readonly FichaHerramientaMcp[], alcance: readonly string[],
): FichaHerramientaMcp[] {
  return herramientas.filter((h) => permisoConcedido(h.permiso, alcance));
}
export function limiteAlcanzado(i: IdentidadRuta): boolean {
  return i.limiteUsos !== null && i.usos >= i.limiteUsos;
}

export function construirRegistro(e: {
  ambito: string; metodo: string; estado: number; inicio: number; fin: number; creadoPor?: string | null;
}): RegistroLlamada {
  const limpio = e.metodo.replace(/[^a-zA-Z0-9._/-]/g, "").slice(0, 80) || "desconocido";
  return {
    ambito_id: e.ambito, tipo: "mcp", endpoint: `mcp/${limpio}`, metodo: "POST",
    status_code: e.estado, respuesta_tiempo_ms: Math.max(0, Math.round(e.fin - e.inicio)),
    creado_por: e.creadoPor ?? null,
  };
}

const errorJsonRpc = (id: string | number | null, code: number, message: string) =>
  ({ jsonrpc: "2.0", id, error: { code, message } });
const respuesta = (cuerpo: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store", ...extra } });
const idDe = (c: unknown): string | number | null => {
  const id = c && typeof c === "object" ? (c as Record<string, unknown>).id : null;
  return typeof id === "string" || typeof id === "number" ? id : null;
};
const metodoDe = (c: unknown): string => {
  const m = c && typeof c === "object" ? (c as Record<string, unknown>).method : null;
  return typeof m === "string" ? m : "desconocido";
};
const nombreHerramienta = (c: unknown): string => {
  const p = c && typeof c === "object" ? (c as Record<string, unknown>).params : null;
  const n = p && typeof p === "object" ? (p as Record<string, unknown>).name : null;
  return typeof n === "string" ? n : "";
};

export function crearRutaMcp(deps: DependenciasRutaMcp) {
  const GET = async (): Promise<Response> =>
    respuesta(errorJsonRpc(null, -32601, "Este servidor MCP solo acepta POST."), 405, { Allow: "POST" });
  const POST = async (req: Request): Promise<Response> => {
    const inicio = deps.ahora();
    let id: string | number | null = null, metodo = "desconocido", estado = 500;
    let identidad: IdentidadRuta | null = null;
    try {
      const crudo = await req.text().catch(() => "");
      if (!crudo || crudo.length > MAX_CUERPO_MCP) {
        estado = 400;
        return respuesta(errorJsonRpc(null, -32600, "El cuerpo está vacío o supera el límite."), 400);
      }
      let cuerpo: unknown;
      try { cuerpo = JSON.parse(crudo); } catch {
        estado = 400;
        return respuesta(errorJsonRpc(null, -32700, "JSON inválido."), 400);
      }
      id = idDe(cuerpo); metodo = metodoDe(cuerpo);
      const ident = await deps.identificar(req);
      if (!ident.ok) { estado = ident.respuesta.status; return ident.respuesta; }
      identidad = ident.identidad;
      if (limiteAlcanzado(identidad)) {
        estado = 429;
        return respuesta(errorJsonRpc(id, -32003, "Límite de uso alcanzado."), 429, { "Retry-After": "60" });
      }
      if (!deps.permitirRafaga(identidad.huella)) {
        estado = 429;
        return respuesta(errorJsonRpc(id, -32003, "Demasiadas llamadas seguidas."), 429, { "Retry-After": "60" });
      }
      const autorizadas = filtrarHerramientas(deps.herramientas, identidad.alcance);
      if (metodo === "tools/call" && !autorizadas.some((h) => h.nombre === nombreHerramienta(cuerpo))) {
        estado = 403;
        return respuesta(errorJsonRpc(id, -32002, "Permiso insuficiente para esta herramienta."), 403);
      }
      estado = 200;
      return respuesta(await atenderMcp(cuerpo, { herramientas: autorizadas }), 200);
    } catch {
      estado = 500;
      return respuesta(errorJsonRpc(id, -32603, "Error interno del servidor MCP."), 500);
    } finally {
      if (identidad) {
        try {
          await deps.registrar(construirRegistro({
            ambito: identidad.ambito, metodo, estado, inicio,
            fin: deps.ahora(), creadoPor: identidad.creadoPor,
          }));
          if (estado !== 429 && identidad.creadoPor === null) await deps.contarUso(identidad.huella);
        } catch {
          // El registro nunca debe tumbar la llamada que se está atendiendo.
        }
      }
    }
  };
  return { GET, POST };
}
