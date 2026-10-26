/**
 * Orden y visibilidad de las secciones del Centro de Control (puro, sin React).
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo guardado vive en `config.controlCenter.{moduleOrder,hiddenModules}` (contexto de apariencia).
 *   · Los ids que ya no existen se descartan y los nuevos se añaden al final: una sección nueva
 *     (como «grabar») aparece sin tocar lo que cada persona había ordenado.
 *   · Las configuraciones guardadas nunca tocadas llevan el orden de fábrica ANTIGUO
 *     (`system, quick, home, notif`, con o sin `conexiones`). Ese orden no lo eligió nadie: se
 *     sustituye por el nuevo, que empieza por «Inicio». Cualquier otro orden se respeta tal cual.
 *   · Nunca se pueden ocultar todas las secciones.
 */

/** Orden de fábrica actual. */
export const ORDEN_POR_DEFECTO: readonly string[] = ["quick", "grabar", "home", "conexiones", "notif", "system"];

/** Órdenes de fábrica de versiones anteriores (nadie los eligió a mano). */
const ORDENES_DE_FABRICA_ANTIGUOS: readonly (readonly string[])[] = [
  ["system", "quick", "home", "notif"],
  ["system", "quick", "conexiones", "home", "notif"],
];

function mismoOrden(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function esOrdenDeFabricaAntiguo(guardado: readonly string[] | undefined): boolean {
  return Array.isArray(guardado) && ORDENES_DE_FABRICA_ANTIGUOS.some((o) => mismoOrden(guardado, o));
}

/** Ids válidos y sin repetir, en el orden de la persona; los que faltan, al final en el orden de fábrica. */
export function resolverOrden(guardado: readonly string[] | undefined, conocidos: readonly string[] = ORDEN_POR_DEFECTO): string[] {
  const validos = new Set(conocidos);
  const base = !Array.isArray(guardado) || esOrdenDeFabricaAntiguo(guardado) ? [] : guardado;
  const vistos = new Set<string>();
  const configurados: string[] = [];
  for (const id of base) {
    if (typeof id !== "string" || !validos.has(id) || vistos.has(id)) continue;
    vistos.add(id);
    configurados.push(id);
  }
  return [...configurados, ...conocidos.filter((id) => !vistos.has(id))];
}

/** Intercambia `id` con su vecino; si no se puede mover (extremo o id desconocido) devuelve el mismo orden. */
export function moverModulo(orden: readonly string[], id: string, dir: -1 | 1): string[] {
  const i = orden.indexOf(id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= orden.length) return [...orden];
  const siguiente = [...orden];
  [siguiente[i], siguiente[j]] = [siguiente[j], siguiente[i]];
  return siguiente;
}

/**
 * Oculta o muestra `id`. Si ocultarlo dejaría el panel sin ninguna sección, no hace nada y lo dice
 * (`aplicado: false`) para que quien llama pueda explicarlo.
 */
export function alternarOculto(ocultos: readonly string[], id: string, total: number): { ocultos: string[]; aplicado: boolean } {
  const conjunto = new Set(ocultos);
  if (conjunto.has(id)) conjunto.delete(id);
  else conjunto.add(id);
  if (conjunto.size >= total) return { ocultos: [...ocultos], aplicado: false };
  return { ocultos: [...conjunto], aplicado: true };
}

/** La sección con la que se abre el panel: «Inicio» si se ve; si no, la primera visible. */
export function seccionInicial(visibles: readonly string[], preferida = "quick"): string {
  return visibles.includes(preferida) ? preferida : (visibles[0] ?? preferida);
}
