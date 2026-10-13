import type { ConnectorStatus } from "@/lib/connectors/model";
import type { IntegrationDescriptor } from "@/lib/integrations/registry";
import type { Ability } from "@/lib/abilities/abilities";
import type { Vinculo } from "@/lib/externos/tipos";
import type { MessagingChannel } from "@/lib/messaging/messaging-channels";

export type ConectorCerebroTipo =
  | "conector"
  | "integracion"
  | "mcp"
  | "cuenta-externa"
  | "canal";

export type ConectorCerebroEstado =
  | "conectado"
  | "falta-clave"
  | "disponible"
  | "error";

export interface ConectorCerebro {
  id: string;
  nombre: string;
  tipo: ConectorCerebroTipo;
  estado: ConectorCerebroEstado;
  enCerebro: boolean;
  enlace: string;
}

export function reunirConectores(
  f: {
    conectores: Array<{ id: string; name: string; status?: string }>;
    integraciones: Array<{ id: string; name: string; configurada: boolean; error?: string | null }>;
    mcp: Array<{ id: string; name: string; enlazada: boolean }>;
    externos: Array<{ id: string; nombre: string; revocado: boolean; expira_en?: string | null }>;
    canales: Array<{ id: string; name: string; activo: boolean }>;
  },
  enCerebro: readonly string[],
  ahora: number
): ConectorCerebro[] {
  const resultado: ConectorCerebro[] = [];

  // Procesar conectores
  for (const c of f.conectores) {
    let estado: ConectorCerebroEstado = "disponible"; // default
    if (c.status === "connected") {
      estado = "conectado";
    } else if (c.status === "needs-auth") {
      estado = "falta-clave";
    } else if (c.status === "error") {
      estado = "error";
    }
    // status === "available" or undefined -> disponible (already set)

    resultado.push({
      id: `conector:${c.id}`,
      nombre: c.name,
      tipo: "conector",
      estado,
      enCerebro: enCerebro.includes(`conector:${c.id}`),
      enlace: `/conexiones`
    });
  }

  // Procesar integraciones
  for (const i of f.integraciones) {
    let estado: ConectorCerebroEstado = "disponible"; // default
    if (!i.configurada) {
      estado = "falta-clave";
    } else if (i.error) {
      estado = "error";
    }

    resultado.push({
      id: `integracion:${i.id}`,
      nombre: i.name,
      tipo: "integracion",
      estado,
      enCerebro: enCerebro.includes(`integracion:${i.id}`),
      enlace: `/conexiones`
    });
  }

  // Procesar MCP
  for (const m of f.mcp) {
    const estado: ConectorCerebroEstado = m.enlazada ? "conectado" : "falta-clave";

    resultado.push({
      id: `mcp:${m.id}`,
      nombre: m.name,
      tipo: "mcp",
      estado,
      enCerebro: enCerebro.includes(`mcp:${m.id}`),
      enlace: `/conexiones`
    });
  }

  // Procesar externos
  for (const e of f.externos) {
    let estado: ConectorCerebroEstado = "disponible"; // default
    if (e.revocado) {
      estado = "error";
    } else if (e.expira_en !== undefined && e.expira_en !== null) {
      const expiraEn = new Date(e.expira_en);
      if (expiraEn.getTime() <= ahora) {
        estado = "error"; // caducado
      }
    }

    resultado.push({
      id: `externo:${e.id}`,
      nombre: e.nombre,
      tipo: "cuenta-externa",
      estado,
      enCerebro: enCerebro.includes(`externo:${e.id}`),
      enlace: `/conexiones`
    });
  }

  // Procesar canales
  for (const canal of f.canales) {
    const estado: ConectorCerebroEstado = canal.activo ? "conectado" : "disponible";

    resultado.push({
      id: `canal:${canal.id}`,
      nombre: canal.name,
      tipo: "canal",
      estado,
      enCerebro: enCerebro.includes(`canal:${canal.id}`),
      enlace: `/conexiones`
    });
  }

  // Ordenar: conectado, falta-clave, error, disponible y luego por nombre
  const ordenEstado: Record<ConectorCerebroEstado, number> = {
    conectado: 0,
    "falta-clave": 1,
    error: 2,
    disponible: 3
  };

  return resultado.sort((a, b) => {
    if (ordenEstado[a.estado] !== ordenEstado[b.estado]) {
      return ordenEstado[a.estado] - ordenEstado[b.estado];
    }
    return a.nombre.localeCompare(b.nombre);
  });
}

export function alternarEnCerebro(ids: readonly string[], id: string): string[] {
  const idsArray = Array.from(ids);
  const index = idsArray.indexOf(id);
  
  if (index === -1) {
    // ID no está en el array, lo agregamos
    return [...idsArray, id];
  } else {
    // ID está en el array, lo removemos
    return [...idsArray.slice(0, index), ...idsArray.slice(index + 1)];
  }
}

export function claveConectores(brainId: string): string {
  // TODO: implement
  return `starseed.brain.${brainId}.conectores`;
}

export function cuentaPorEstado(lista: ConectorCerebro[]): Record<ConectorCerebroEstado, number> {
  const cuenta: Record<ConectorCerebroEstado, number> = {
    conectado: 0,
    "falta-clave": 0,
    error: 0,
    disponible: 0
  };

  for (const item of lista) {
    cuenta[item.estado]++;
  }

  return cuenta;
}