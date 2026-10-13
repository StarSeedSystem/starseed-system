/**
 * Cerebro · Conectores (pilar CB1013H / CB1013I)
 *
 * Lógica pura: reúne conectores, integraciones, MCP, cuentas externas y canales
 * en una lista estructurada por cerebro, con estado traducido al español,
 * prefijos de id por tipo y orden fijo.
 *
 * Sin Supabase, sin window, sin node:*.
 */

export interface ConectorCerebro {
  id: string;               // con prefijo: conector:, integracion:, mcp:, externo:, canal:
  nombre: string;
  tipo: "conector" | "integracion" | "mcp" | "cuenta-externa" | "canal";
  estado: "conectado" | "falta-clave" | "disponible" | "error";
  enCerebro: boolean;
  enlace: string;
}

export function claveConectores(brainId: string): string {
  return `starseed.brain.${brainId}.conectores`;
}

export type FuentesConectores = {
  conectores: Array<{ id: string; name: string; status?: string }>;
  integraciones: Array<{ id: string; name: string; configurada: boolean; error?: string | null }>;
  mcp: Array<{ id: string; name: string; enlazada: boolean }>;
  externos: Array<{ id: string; nombre: string; revocado: boolean; expira_en?: string | null }>;
  canales: Array<{ id: string; name: string; activo: boolean }>;
};

/** Traduce el estado del conector al español. */
function estadoConector(status?: string): "conectado" | "falta-clave" | "disponible" | "error" {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "connected": return "conectado";
    case "needs-auth": return "falta-clave";
    case "available": return "disponible";
    case "error": return "error";
    default: return "disponible";
  }
}

function enCerebroActivo(id: string, enCerebro: readonly string[]): boolean {
  return enCerebro.includes(id);
}

export function reunirConectores(
  f: FuentesConectores,
  enCerebro: readonly string[],
  ahora: number,
): ConectorCerebro[] {
  const lista: ConectorCerebro[] = [];

  // 1. Conectores (listConnectors)
  for (const c of f.conectores) {
    const idConPrefijo = `conector:${c.id}`;
    lista.push({
      id: idConPrefijo,
      nombre: c.name,
      tipo: "conector",
      estado: estadoConector(c.status),
      enCerebro: enCerebroActivo(idConPrefijo, enCerebro),
      enlace: "/conexiones",
    });
  }

  // 2. Integraciones (INTEGRATIONS + loadIntegrationConfig)
  for (const i of f.integraciones) {
    const idConPrefijo = `integracion:${i.id}`;
    const conError = !!i.error;
    const estadoIntegracion: ConectorCerebro["estado"] = conError ? "error" : (i.configurada ? "conectado" : "disponible");
    lista.push({
      id: idConPrefijo,
      nombre: i.name,
      tipo: "integracion",
      estado: estadoIntegracion,
      enCerebro: enCerebroActivo(idConPrefijo, enCerebro),
      enlace: "/conexiones",
    });
  }

  // 3. MCP (loadAbilities + ability_links)
  for (const m of f.mcp) {
    const idConPrefijo = `mcp:${m.id}`;
    lista.push({
      id: idConPrefijo,
      nombre: m.name,
      tipo: "mcp",
      estado: m.enlazada ? "conectado" : "disponible",
      enCerebro: enCerebroActivo(idConPrefijo, enCerebro),
      enlace: "/conexiones",
    });
  }

  // 4. Externos (os_vinculos_externos)
  for (const e of f.externos) {
    const idConPrefijo = `externo:${e.id}`;
    const revocado = !!e.revocado;
    const expira = e.expira_en ? new Date(e.expira_en).getTime() : null;
    const caducado = expira !== null ? expira <= ahora : false;
    const estaError = revocado || caducado;
    lista.push({
      id: idConPrefijo,
      nombre: e.nombre,
      tipo: "cuenta-externa",
      estado: estaError ? "error" : "conectado",
      enCerebro: enCerebroActivo(idConPrefijo, enCerebro),
      enlace: "/conexiones",
    });
  }

  // 5. Canales (messaging_channels)
  for (const ch of f.canales) {
    const idConPrefijo = `canal:${ch.id}`;
    lista.push({
      id: idConPrefijo,
      nombre: ch.name,
      tipo: "canal",
      estado: ch.activo ? "conectado" : "disponible",
      enCerebro: enCerebroActivo(idConPrefijo, enCerebro),
      enlace: "/conexiones",
    });
  }

  // Orden: conectado, falta-clave, error, disponible; luego por nombre.
  const ordenEstado: Record<string, number> = {
    conectado: 0,
    "falta-clave": 1,
    error: 2,
    disponible: 3,
  };
  lista.sort((a, b) => {
    const oa = ordenEstado[a.estado] ?? 99;
    const ob = ordenEstado[b.estado] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.nombre.localeCompare(b.nombre);
  });

  return lista;
}

export function alternarEnCerebro(ids: readonly string[], id: string): string[] {
  // Esqueleto.
  return ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
}

export function cuentaPorEstado(lista: ConectorCerebro[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const c of lista) {
    cuenta[c.estado] = (cuenta[c.estado] ?? 0) + 1;
  }
  return cuenta;
}
