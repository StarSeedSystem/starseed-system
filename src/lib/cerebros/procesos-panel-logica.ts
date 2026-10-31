// Lógica pura del panel «Procesos activos» (CB1013N).
// Contrato: architecture/cerebros-fusion-telepatia.md §7. Sin disco ni red.

import { ETIQUETA_TIPO, type ProcesoActivo, type TipoProceso } from "./procesos";

export interface AccionProceso {
  /** "genesis" abre /genesis (agentes); "ventana" restaura una ventana minimizada; "ninguna" = solo lectura. */
  clase: "genesis" | "ventana" | "ninguna";
  desktopId: string | null;
  winId: string | null;
}

/**
 * Acción existente disponible para un proceso: abrir Genesis para agentes
 * (tipo "genesis") o restaurar la ventana minimizada cuyo id normalizado es
 * `ventana:<desktopId>:<winId>`. Lo demás es solo lectura (§7 Acciones).
 */
export function accionProceso(x: ProcesoActivo): AccionProceso {
  const clase: AccionProceso["clase"] =
    x.tipo === "genesis" ? "genesis" : x.tipo === "app-fondo" && x.id.startsWith("ventana:") ? "ventana" : "ninguna";
  const partes = clase === "ventana" ? x.id.split(":") : [];
  return {
    clase,
    desktopId: partes.length >= 3 ? partes[1] : null,
    winId: partes.length >= 3 ? partes.slice(2).join(":") : null,
  };
}


/** Tipos que el panel enseña: los de las preferencias, o todos si están vacíos. */
export function tiposVisibles(sel: TipoProceso[] | undefined): TipoProceso[] {
  const validos = Object.keys(ETIQUETA_TIPO) as TipoProceso[];
  if (!sel || sel.length === 0) return validos;
  const set = new Set(sel);
  return validos.filter((t) => set.has(t));
}

/** Procesos cuyos tipos están dentro de `tipos` (purga los de ajustes viejos). */
export function filtrarPorTipos(procesos: ProcesoActivo[], tipos: TipoProceso[]): ProcesoActivo[] {
  const set = new Set(tipos);
  return procesos.filter((x) => set.has(x.tipo));
}

/** Cuenta de procesos reales por tipo, con la etiqueta de cada tipo. */
export function contarPorTipos(
  procesos: ProcesoActivo[],
  tipos: TipoProceso[],
): Array<{ tipo: TipoProceso; etiqueta: string; cuenta: number }> {
  const out: Array<{ tipo: TipoProceso; etiqueta: string; cuenta: number }> = [];
  for (const tipo of tipos) out.push({ tipo, etiqueta: ETIQUETA_TIPO[tipo], cuenta: 0 });
  const porTipo = new Map(out.map((e) => [e.tipo, e]));
  for (const x of procesos) {
    const e = porTipo.get(x.tipo);
    if (e) e.cuenta += 1;
  }
  return out;
}
