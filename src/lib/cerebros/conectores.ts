// ════════════════════════════════════════════════════════════════
// CONECTORES · Lógica pura del pilar de Conectores
// ----------------------------------------------------------------
// Fuente de verdad para el pilar Conectores en /cerebro.
// Proporciona una combinación filtrada de conectores del sistema con su
// estado en CADA cerebro, para mostrar en el hub y actuar.
//
// Tipos exportados:
//   • ConectorCerebro     – unificador flexible por causa
//   • ConectorCerebro[]    – lista de conexión para el hub del cerebro
//
// Funciones exportadas:
//   • reunirConectores      – construye el array, aplica orden, filtra habilitados, añade enlaces y marcas
//   • alternarEnCerebro     – aplica/quita un conector de la lista `starseed.brain.<id>.conectores`
//   • claveConectores      – getter determinista para la clave de storage `starseed.brain.<id>.conectores`
//   • cuentaPorEstado      – agrupa conectores por estado legible para barras/burbujas
//
// El módulo está en ESTADO PURO: NO toca Supabase, NO toca localStorage,
// NO navega, NO lanza (excepto los mencionados en §9 para decidir).
// Solo tipa lo que entra y lo que sale: seguro para servidor y cliente.
//
// Vinculación con CLAUDE.md · §6 Conectores y §3 Ciberdelia:
//   • Decorado, no intrusivo; colores armónicos por categoría.
//   • Estados honestos: si no tiene configuración o está apagado, es 'disponible' (normal), no 'error' (defensivo).
//   • Solo puede ocurrir uno de tres en cada conector: error, falta-clave, conectado.
// =================================================================

// ════════════════════════════════════════════════════════════════
// Tipos
// ════════════════════════════════════════════════════════════════

export type EstadoConector = "conectado" | "falta-clave" | "disponible" | "error";

export interface ConectorCerebro {
  /** Prefijo obligatorio por tipo para evitación de colisiones. */
  id: string; // ej: "conector:crawl4ai", "integracion:dify", "mcp:starseed-mcp", "cuenta-externa:teammate", "canal:terminal"
  /** Etiqueta legible para la UI (herencia del origen). */
  nombre: string;
  /** Tipo de conector (unificador principal para estilos en el hub). */
  tipo: "conector" | "integracion" | "mcp" | "cuenta-externa" | "canal";
  /** Estado actual y legible para el badge. */
  estado: EstadoConector;
  /** Si este conector aparece EN el cerebro actual (independientemente de estado). */
  enCerebro: boolean;
  /** Cómo se activa en el cerebro (marca, flow, ruta). */
  enlace: string;
}

// ════════════════════════════════════════════════════════════════
// Utils / Clave determinista
// ════════════════════════════════════════════════════════════════

/** Clave determinista para storage de preferencia de conectores por cerebro. */
export function claveConectores(brainId: string): string {
  return `starseed.brain.${brainId}.conectores`;
}

/** Normaliza un estado técnico a uno legible en español. */
function aEstadoLegible(estado: EstadoConector): string {
  const map: Record<EstadoConector, string> = {
    conectado: "Conectado",
    "falta-clave": "Requiere conexión",
    disponible: "Disponible",
    error: "Error",
  };
  return map[estado];
}

// ════════════════════════════════════════════════════════════════
// reunidor principal – combina todos los tipos desde las fuentes
// ════════════════════════════════════════════════════════════════

export interface EntradaReunirConectores {
  conectores: Array<{ id: string; name: string; status?: string }>;
  integraciones: Array<{ id: string; name: string; configurada: boolean; error?: string | null }>;
  mcp: Array<{ id: string; name: string; enlazada: boolean }>;
  externos: Array<{ id: string; nombre: string; revocado: boolean; expira_en?: string | null }>;
  canales: Array<{ id: string; name: string; activo: boolean }>;
}

export interface EnCerebroSet {
  // Sólo necesitamos conocer el set (ids), no valores extra.
  ids: Set<string>;
}

/** Construye un array unificado de ConectorCerebro, con orden por prioridad y estados honestos. */
export function reunirConectores(
  fuente: EntradaReunirConectores,
  enCerebro: readonly string[],
  ahora: number,
): ConectorCerebro[] {
  const resultado: ConectorCerebro[] = [];

  // ── 1. Conectores (fuente del registro) ───────────────────────────
  for (const c of fuente.conectores) {
    const pref = `conector:${c.id}`;
    const baseEstado = c.status === "needs-auth" ? "falta-clave" : c.status === "error" ? "error" : "disponible";
    const conectado = enCerebro.includes(pref);
    const estadoFinal = conectado ? "conectado" : baseEstado;
    resultado.push({
      id: pref,
      nombre: c.name,
      tipo: "conector",
      estado: estadoFinal,
      enCerebro: conectado,
      enlace: `/conexiones/conector/${c.id}`,
    });
  }

  // ── 2. Integraciones ──────────────────────────────────────────────
  for (const i of fuente.integraciones) {
    const pref = `integracion:${i.id}`;
    let estado: EstadoConector;
    if (i.error) estado = "error";
    else if (!i.configurada) estado = "falta-clave";
    else estado = "disponible";
    const conectado = enCerebro.includes(pref);
    const estadoFinal = conectado ? "conectado" : estado;
    resultado.push({
      id: pref,
      nombre: i.name,
      tipo: "integracion",
      estado: estadoFinal,
      enCerebro: conectado,
      enlace: `/conexiones/integracion/${i.id}`,
    });
  }

  // ── 3. MCP (servidores / habilidades) ─────────────────────────────
  for (const m of fuente.mcp) {
    const pref = `mcp:${m.id}`;
    const estado = m.enlazada ? "conectado" : "disponible";
    const conectado = enCerebro.includes(pref);
    const estadoFinal = conectado ? "conectado" : estado;
    resultado.push({
      id: pref,
      nombre: m.name,
      tipo: "mcp",
      estado: estadoFinal,
      enCerebro: conectado,
      enlace: `/conexiones/mcp/${m.id}`,
    });
  }

  // ── 4. Cuentas externas ─────────────────────────────────────────
  for (const e of fuente.externos) {
    const pref = `externo:${e.id}`;
    const revocado = e.revocado || (e.expira_en && new Date(e.expira_en).getTime() < ahora);
    const estado = revocado ? "error" : "disponible";
    const conectado = enCerebro.includes(pref);
    const estadoFinal = conectado ? "conectado" : estado;
    resultado.push({
      id: pref,
      nombre: e.nombre,
      tipo: "cuenta-externa",
      estado: estadoFinal,
      enCerebro: conectado,
      enlace: `/conexiones/externo/${e.id}`,
    });
  }

  // ── 5. Canales de mensajería ──────────────────────────────────────
  for (const ch of fuente.canales) {
    const pref = `canal:${ch.id}`;
    const estado = ch.activo ? "conectado" : "disponible";
    const conectado = enCerebro.includes(pref);
    const estadoFinal = conectado ? "conectado" : estado;
    resultado.push({
      id: pref,
      nombre: ch.name,
      tipo: "canal",
      estado: estadoFinal,
      enCerebro: conectado,
      enlace: `/conexiones/canal/${ch.id}`,
    });
  }

  // ── 6. Orden: conectado → falta-clave → error → disponible y luego por nombre ──
  const prioridadOrden: Record<EstadoConector, number> = {
    conectado: 0,
    "falta-clave": 1,
    error: 2,
    disponible: 3,
  }; // vacío para inanimados; los que no están en este map van al final

  resultado.sort((a, b) => {
    const ia = prioridadOrden[a.estado];
    const ib = prioridadOrden[b.estado];
    if (ia !== undefined && ib !== undefined) {
      if (ia !== ib) return ia - ib;
    }
    // fallback: orden alfabético por nombre
    return a.nombre.localeCompare(b.nombre);
  });

  return resultado;
}

// ════════════════════════════════════════════════════════════════
// manipulador de lista por cerebro (storage local)
// ════════════════════════════════════════════════════════════════

/** Alterna un conector en la lista de habilitados del cerebro (`starseed.brain.<id>.conectores`). */
export function alternarEnCerebro(ids: readonly string[], id: string): string[] {
  const sinDuplicados = new Set(ids);
  if (sinDuplicados.has(id)) sinDuplicados.delete(id);
  else sinDuplicados.add(id);
  return Array.from(sinDuplicados).sort();
}

/** Agrupa conectores por estado legible para barras/burbujas. */
export function cuentaPorEstado(lista: ConectorCerebro[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const c of lista) {
    const legible = aEstadoLegible(c.estado);
    cuenta[legible] = (cuenta[legible] || 0) + 1;
  }
  return cuenta;
}
