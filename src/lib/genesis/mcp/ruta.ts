/**
 * Ruta MCP remota por ámbito con permisos (tarea S · Ola 1019G · Genesis abierto).
 * PURO: red, reloj, Supabase y almacenamiento inyectables; la ruta HTTP concreta en
 * src/app/api/mcp/genesis/route.ts. Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
import type { CapacidadAmbito } from "@/lib/mando/ambito";
import { atenderMcp, type RespuestaJsonRpc } from "./protocolo";
import type { FichaHerramientaMcp, PermisoMcp } from "./herramientas";
import { huellaSha256, incrementarUso, verificarToken, type AlmacenTokens } from "./tokens-externos";

/** Límite de uso por token, cuando el ámbito no declara uno propio. */
export const LIMITE_USOS_DEFECTO = 1000;

/** Cada permiso de herramienta se paga con una capacidad del ámbito (los 12). */
export const CAPACIDAD_POR_PERMISO: Record<PermisoMcp, CapacidadAmbito> = {
  "estado:leer": "ver-resumen",
  "tareas:listar": "ver-resumen",
  "tareas:crear": "encolar",
  "agentes:listar": "ver-resumen",
  "medidores:leer": "ver-resumen",
  "operaciones:proponer": "encolar",
  "biblioteca:buscar": "ver-detalle",
  "opciones:sugerir": "ver-resumen",
  "chat:enviar": "chatear",
  "variaciones:buscar": "ver-resumen",
};

/** Sesión que la ruta HTTP ya resolvió con Supabase. */
export interface SesionResuelta {
  ambito: string;
  alcance: CapacidadAmbito[];
  /** Id del usuario autenticado; solo al registro, nunca al cliente. */
  creador: string;
}
/** Línea de registro sin datos sensibles: quién, qué método y con qué estado. */
export interface RegistroLlamada {
  via: "token" | "sesion"; ambito: string; metodo: string; endpoint: string; tipo: string; statusCode: number;
}
export interface DependenciasRuta {
  almacen: AlmacenTokens; reloj: () => number; registrar: (l: RegistroLlamada) => Promise<boolean>; limiteUsos?: number;
}
export type Acceso =
  | { ok: true; via: "token" | "sesion"; ambito: string; alcance: string[] }
  | { ok: false; status: number; mensaje: string; via?: "token" | "sesion"; ambito?: string };
export interface DirigidoMcp { status: number; salida: RespuestaJsonRpc | { error: string } }

/** Extrae SOLO el valor del token de la cabecera Authorization; nunca se guarda. */
export function extraerBearer(cabecera: string | null): string | null {
  if (!cabecera) return null;
  const m = cabecera.match(/^Bearer\s+(\S{10,})$/i);
  return m ? m[1] : null;
}

/** Saca del alcance las herramientas cuyo permiso no está concedido. */
export function filtrarHerramientas(herramientas: readonly FichaHerramientaMcp[], alcance: readonly string[]): FichaHerramientaMcp[] {
  return herramientas.filter((h) => alcance.includes(CAPACIDAD_POR_PERMISO[h.permiso]));
}

export function recurso405(): RespuestaJsonRpc {
  return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "El MCP de Genesis solo acepta POST." } };
}

/** Resuelve quién llama: token externo del ámbito (con límite de uso) o sesión. */
export async function resolverAcceso(deps: DependenciasRuta, bearer: string | null, sesion: SesionResuelta | null): Promise<Acceso> {
  const limite = deps.limiteUsos ?? LIMITE_USOS_DEFECTO;
  if (!bearer) {
    if (!sesion) return { ok: false, status: 401, mensaje: "Necesitas un token Bearer del ámbito o una sesión iniciada." };
    return { ok: true, via: "sesion", ambito: sesion.ambito, alcance: [...sesion.alcance] };
  }
  const huella = await huellaSha256(bearer);
  const entrada = deps.almacen.leerPorHuella(huella);
  const valido = await verificarToken(bearer, deps.almacen, deps.reloj());
  if (!valido || !entrada) return { ok: false, status: 401, mensaje: "Token no válido o revocado.", via: "token" };
  if (entrada.usos >= limite) {
    return { ok: false, status: 429, mensaje: "Se agotó el límite de uso del token.", via: "token", ambito: entrada.ambito };
  }
  incrementarUso(huella, deps.almacen);
  return { ok: true, via: "token", ambito: valido.ambito, alcance: [...valido.alcance] };
}

/** Línea de registro; null si no hay ámbito conocido (nada que registrar). */
function registro(acceso: Acceso, tipo: string, endpoint: string, statusCode: number): RegistroLlamada | null {
  if (!acceso.via || !acceso.ambito) return null;
  return { via: acceso.via, ambito: acceso.ambito, metodo: "POST", endpoint, tipo, statusCode };
}

function esJsonRpc(x: unknown): x is { method: string } {
  return !!x && typeof x === "object" && (x as Record<string, unknown>).jsonrpc === "2.0"
    && typeof (x as Record<string, unknown>).method === "string";
}

/** POST completo: acceso, filtro de herramientas por alcance, JSON-RPC y registro. */
export async function atenderMcpConPermisos(
  cuerpo: unknown,
  herramientas: readonly FichaHerramientaMcp[],
  deps: DependenciasRuta,
  bearer: string | null,
  sesion: SesionResuelta | null,
  endpoint: string,
): Promise<DirigidoMcp> {
  const acceso = await resolverAcceso(deps, bearer, sesion);
  const tipo = esJsonRpc(cuerpo) ? cuerpo.method : "solicitud-invalida";
  const enviar = async (statusCode: number) => {
    const llamada = registro(acceso, tipo, endpoint, statusCode);
    if (llamada) await deps.registrar(llamada);
  };
  if (!acceso.ok) {
    await enviar(acceso.status);
    return { status: acceso.status, salida: { error: acceso.mensaje } };
  }
  if (!esJsonRpc(cuerpo)) {
    await enviar(400);
    return { status: 400, salida: { error: "Se espera una solicitud JSON-RPC 2.0." } };
  }
  const respuesta = await atenderMcp(cuerpo, {
    herramientas: filtrarHerramientas(herramientas, acceso.alcance),
    contexto: { ambito: acceso.ambito, via: acceso.via, alcance: acceso.alcance },
  });
  await enviar(200);
  return { status: 200, salida: respuesta };
}
