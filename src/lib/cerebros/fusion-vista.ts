import type { PlanFusion } from "./fusion";

/** Palabras legibles para cada acción del plan, con el número real de secciones (CB1013D). */
export function palabraDeAccion(archivo: PlanFusion["archivos"][number]): string {
  if (archivo.accion === "copiar") return "copia";
  if (archivo.accion === "omitir") return "ya estaba";
  const n = seccionesAnadidas(archivo.contenido);
  return n === 1 ? "añade 1 sección" : `añade ${n} secciones`;
}

/** Cuántas secciones fusionadas lleva el contenido final (cada «Fusionado de «» es una sección nueva). */
export function seccionesAnadidas(contenido: string): number {
  return (contenido.match(/## Fusionado de «/g) ?? []).length;
}

/** Los bytes en KO con coma decimal; los menores de 1024 se quedan en B. */
export function textoKb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${String(Math.round((bytes / 1024) * 10) / 10).replace(".", ",")} KB`;
}

/** Cuentas reales medidas del plan: nada inventado. */
export function cuentasPlan(plan: PlanFusion): { incluir: number; servidores: number; preferencias: number } {
  const i = plan.includes;
  const incluir = (i.vaults.length + i.backends.length + i.personalities.length + i.runtimes.length + i.tokens.length + i.memories.length + i.connections.length + (Array.isArray(i.permissions) ? i.permissions.length : i.permissions ? 1 : 0));
  return { incluir, servidores: plan.servers.length, preferencias: Object.keys(plan.prefs).length };
}
