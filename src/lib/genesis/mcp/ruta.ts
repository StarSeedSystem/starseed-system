/**
 * Ruta MCP remota por ámbito con permisos (Genesis abierto · tarea S · Ola 1019G).
 * PURO: red, reloj, Supabase y almacenamiento inyectables. La ruta HTTP vive en
 * src/app/api/mcp/genesis/route.ts; esta capa solo decide, sin I/O.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
import type { CapacidadAmbito } from "@/lib/mando/ambito";
import { atenderMcp, type RespuestaJsonRpc } from "./protocolo";
import type { FichaHerramientaMcp, PermisoMcp } from "./herramientas";
import {
  huellaSha256,
  incrementarUso,
  verificarToken,
  type AlmacenTokens,
} from "./tokens-externos";

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
};

/** Sesión que la ruta HTTP ya resolvió con Supabase (la cookie no entra aquí). */
export interface SesionResuelta {
  ambito: string;
  alcance: CapacidadAmbito[];
  /** Id del usuario autenticado; solo al registro, nunca al cliente. */
  creador: string;
}

/** Línea de registro sin datos sensibles: quién, qué método y con qué estado. */
export interface RegistroLlamada {
  via: "token" | "sesion";
  /** Al llama: id del ámbito (también para la columna ambito_id). */
  ambito: string;
  metodo: string;
  endpoint: string;
  tipo: string;
  statusCode: number;
}

export interface DependenciasRuta {
  almacen: AlmacenTokens;
  reloj: () => number;
  registrar: (llamada: RegistroLlamada) => Promise<boolean>;
  limiteUsos?: number;
}

export type Acceso =
  | { ok: true; via: "token" | "sesion"; ambito: string; alcance: string[] }
  | { ok: false; status: number; mensaje: string; via?: "token" | "sesion"; ambito?: string };

export interface DirigidoMcp {
  status: number;
  salida: RespuestaJsonRpc | { error: string };
}

// (trozo 2: extraerBearer, filtrarHerramientas, recurso405, resolverAcceso)
// (trozo 3: registro y atenderMcpConPermisos)
