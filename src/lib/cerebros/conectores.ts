/*
 * Cerebros · Conectores (pilar) — lógica PURA
 * Reúne en una lista única los conectores, integraciones, servidores MCP,
 * cuentas externas y canales disponibles para un cerebro, sin tocar red ni
 * disco: las fuentes las lee el llamador y aquí solo se normalizan y ordenan.
 * Contrato: architecture/cerebros-fusion-telepatia.md §6.
 */

export type TipoConector = "conector" | "integracion" | "mcp" | "cuenta-externa" | "canal";

export type EstadoConector = "conectado" | "falta-clave" | "disponible" | "error";

export interface ConectorCerebro {
  id: string;
  nombre: string;
  tipo: TipoConector;
  estado: EstadoConector;
  /** true si el usuario lo activó para este cerebro. */
  enCerebro: boolean;
  /** Ruta donde se configura. */
  enlace: string;
}

/** Entradas estructurales mínimas (las reúne el llamador desde sus fuentes). */
export interface FuentesConectores {
  conectores: Array<{ id: string; name: string; status?: string }>;
  integraciones: Array<{ id: string; name: string; configurada: boolean; error?: string | null }>;
  mcp: Array<{ id: string; name: string; enlazada: boolean }>;
  externos: Array<{ id: string; nombre: string; revocado: boolean; expira_en?: string | null }>;
  canales: Array<{ id: string; name: string; activo: boolean }>;
}

/** Clave local de la selección «usar en este cerebro» (se sincroniza con prefs). */
export function claveConectores(brainId: string): string {
  return `starseed.brain.${brainId}.conectores`;
}

/** Añade o quita un id de la selección, sin duplicar. */
export function alternarEnCerebro(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Cuenta por estado, para los resúmenes del panel. */
export function cuentaPorEstado(lista: readonly ConectorCerebro[]): Record<EstadoConector, number> {
  const cuenta: Record<EstadoConector, number> = { conectado: 0, "falta-clave": 0, disponible: 0, error: 0 };
  for (const c of lista) cuenta[c.estado] += 1;
  return cuenta;
}

function estadoDesdeStatus(status?: string): EstadoConector {
  switch (status) {
    case "connected": return "conectado";
    case "needs-auth": return "falta-clave";
    case "error": return "error";
    default: return "disponible";
  }
}

function caducado(expira_en: string | null | undefined, ahora: number): boolean {
  if (!expira_en) return false;
  const t = new Date(expira_en).getTime();
  return Number.isFinite(t) && t <= ahora;
}

const ORDEN: Record<EstadoConector, number> = { conectado: 0, "falta-clave": 1, error: 2, disponible: 3 };

/**
 * Normaliza las cinco fuentes en ConectorCerebro, con prefijo de id por tipo,
 * y las ordena: conectado → falta-clave → error → disponible, luego por nombre.
 */
export function reunirConectores(
  f: FuentesConectores,
  enCerebro: readonly string[],
  ahora: number,
): ConectorCerebro[] {
  const lista: ConectorCerebro[] = [];
  for (const c of f.conectores) {
    lista.push({ id: `conector:${c.id}`, nombre: c.name, tipo: "conector", estado: estadoDesdeStatus(c.status), enCerebro: false, enlace: "/conexiones" });
  }
  for (const i of f.integraciones) {
    const estado: EstadoConector = i.error ? "error" : i.configurada ? "conectado" : "disponible";
    lista.push({ id: `integracion:${i.id}`, nombre: i.name, tipo: "integracion", estado, enCerebro: false, enlace: "/conexiones" });
  }
  for (const m of f.mcp) {
    lista.push({ id: `mcp:${m.id}`, nombre: m.name, tipo: "mcp", estado: m.enlazada ? "conectado" : "disponible", enCerebro: false, enlace: "/conexiones" });
  }
  for (const e of f.externos) {
    lista.push({ id: `externo:${e.id}`, nombre: e.nombre, tipo: "cuenta-externa", estado: e.revocado || caducado(e.expira_en, ahora) ? "error" : "conectado", enCerebro: false, enlace: "/cuenta" });
  }
  for (const ch of f.canales) {
    lista.push({ id: `canal:${ch.id}`, nombre: ch.name, tipo: "canal", estado: ch.activo ? "conectado" : "disponible", enCerebro: false, enlace: "/conexiones" });
  }
  for (const c of lista) c.enCerebro = enCerebro.includes(c.id);
  lista.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}
