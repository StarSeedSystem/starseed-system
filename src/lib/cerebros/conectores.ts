/**
 * Conectores cerebros · Lógica pura (CB1013H).
 * ---------------------------------------------------------------------------
 * Lógica pura para el pilar «Conectores» en la sección de cerebros.
 * Contrato: architecture/cerebros-fusion-telepatia.md §6.
 *
 * Módulo PURO: sin Supabase, sin window, sin node:* .
 */

/* ────────────────────────────────────────────────────────────────────────── */
/* Tipos de entrada (solo import type si hace falta) */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Conector del Hub de Conectores / Integraciones (src/lib/connectors/model.ts).
 * Estado: "available", "connected" o "needs-auth".
 */
export type ConectorHub = Pick<
  import("../connectors/model").Connector,
  "id" | "name" | "status"
>;

/**
 * Integración del registro (src/lib/integrations/registry.ts).
 * Configurada: boolean, error: string | null.
 */
export type IntegracionRegistro = {
  id: string;
  name: string;
  configurada: boolean;
  error: string | null;
};

/**
 * MCP / habilidad atada (src/lib/abilities/abilities.ts).
 * Enlazada: boolean.
 */
export type McpHabilidad = {
  id: string;
  name: string;
  enlazada: boolean;
};

/**
 * Cuenta externa (src/lib/externos/tipos.ts).
 * Revocado: boolean, expira_en: string | null.
 */
export type CuentaExterna = {
  id: string;
  nombre: string;
  revocado: boolean;
  expira_en: string | null;
};

/**
 * Canal de mensajería (src/lib/messaging/messaging-channels.ts).
 * Activo: boolean.
 */
export type CanalMensajeria = {
  id: string;
  name: string;
  activo: boolean;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Tipo de salida */
/* ────────────────────────────────────────────────────────────────────────── */

export type TipoConector =
  | "conector"
  | "integracion"
  | "mcp"
  | "cuenta-externa"
  | "canal";

export type EstadoConector =
  | "conectado"
  | "falta-clave"
  | "disponible"
  | "error";

export interface ConectorCerebro {
  id: string;
  nombre: string;
  tipo: TipoConector;
  estado: EstadoConector;
  enCerebro: boolean;
  enlace: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Funciones puras */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Une todos los conectores en una sola lista con su estado y tipo.
 * @param f Fuentes de datos
 * @param enCerebro IDs de conectores activados en este cerebro
 * @param ahora Timestamp actual para validar expiraciones
 * @return Lista de ConectorCerebro ordenada por estado y luego nombre
 */
export function reunirConectores(
  f: {
    conectores: ConectorHub[];
    integraciones: IntegracionRegistro[];
    mcp: McpHabilidad[];
    externos: CuentaExterna[];
    canales: CanalMensajeria[];
  },
  enCerebro: readonly string[],
  ahora: number
): ConectorCerebro[] {
  const resultado: ConectorCerebro[] = [];

  // Procesar conectores del hub
  for (const c of f.conectores) {
    const tipo: TipoConector = "conector";
    let estado: EstadoConector;
    switch (c.status) {
      case "connected":
        estado = "conectado";
        break;
      case "needs-auth":
        estado = "falta-clave";
        break;
      case "available":
      default:
        estado = "disponible";
    }
    resultado.push({
      id: `conector:${c.id}`,
      nombre: c.name,
      tipo,
      estado,
      enCerebro: enCerebro.includes(`conector:${c.id}`),
      enlace: `/conexiones`,
    });
  }

  // Procesar integraciones
  for (const i of f.integraciones) {
    const tipo: TipoConector = "integracion";
    let estado: EstadoConector;
    if (!i.configurada) {
      estado = "falta-clave";
    } else if (i.error) {
      estado = "error";
    } else {
      estado = "conectado";
    }
    resultado.push({
      id: `integracion:${i.id}`,
      nombre: i.name,
      tipo,
      estado,
      enCerebro: enCerebro.includes(`integracion:${i.id}`),
      enlace: `/conexiones`,
    });
  }

  // Procesar MCP / habilidades
  for (const m of f.mcp) {
    const tipo: TipoConector = "mcp";
    const estado: EstadoConector = m.enlazada ? "conectado" : "disponible";
    resultado.push({
      id: `mcp:${m.id}`,
      nombre: m.name,
      tipo,
      estado,
      enCerebro: enCerebro.includes(`mcp:${m.id}`),
      enlace: `/conexiones`,
    });
  }

  // Procesar cuentas externas
  for (const e of f.externos) {
    const tipo: TipoConector = "cuenta-externa";
    let estado: EstadoConector;
    if (e.revocado) {
      estado = "error";
    } else if (e.expira_en && new Date(e.expira_en).getTime() < ahora) {
      estado = "error";
    } else {
      estado = "disponible";
    }
    resultado.push({
      id: `externo:${e.id}`,
      nombre: e.nombre,
      tipo,
      estado,
      enCerebro: enCerebro.includes(`externo:${e.id}`),
      enlace: `/conexiones`,
    });
  }

  // Procesar canales de mensajería
  for (const c of f.canales) {
    const tipo: TipoConector = "canal";
    const estado: EstadoConector = c.activo ? "conectado" : "disponible";
    resultado.push({
      id: `canal:${c.id}`,
      nombre: c.name,
      tipo,
      estado,
      enCerebro: enCerebro.includes(`canal:${c.id}`),
      enlace: `/conexiones`,
    });
  }

  // Ordenar: conectado, falta-clave, error, disponible y luego por nombre
  const ordenEstado: Record<EstadoConector, number> = {
    conectado: 0,
    "falta-clave": 1,
    error: 2,
    disponible: 3,
  };

  return [...resultado].sort((a, b) => {
    const diff = ordenEstado[a.estado] - ordenEstado[b.estado];
    if (diff !== 0) return diff;
    return a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" });
  });
}

/**
 * Alterna la presencia de un ID en la lista de IDs.
 * @param ids Lista actual de IDs
 * @param id ID a alternar
 * @return Nueva lista con el ID añadido o eliminado
 */
export function alternarEnCerebro(
  ids: readonly string[],
  id: string
): string[] {
  return ids.includes(id)
    ? ids.filter((i) => i !== id)
    : [...ids, id];
}

/**
 * Clave de preferencias para conectores de un cerebro.
 * @param brainId ID del cerebro
 * @return Clave de localStorage
 */
export function claveConectores(brainId: string): string {
  return `starseed.brain.${brainId}.conectores`;
}

/**
 * Cuenta cuántos elementos hay por estado en una lista.
 * @param lista Lista de ConectorCerebro
 * @return Objeto con conteo por estado
 */
export function cuentaPorEstado(
  lista: ConectorCerebro[]
): Record<EstadoConector, number> {
  const cuenta: Record<EstadoConector, number> = {
    conectado: 0,
    "falta-clave": 0,
    error: 0,
    disponible: 0,
  };

  for (const c of lista) {
    cuenta[c.estado]++;
  }

  return cuenta;
}