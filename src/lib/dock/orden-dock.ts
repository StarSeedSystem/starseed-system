// src/lib/dock/orden-dock.ts
/**
 * ORDEN DEL DOCK — funciones puras para reordenar, agrupar y quitar iconos (Ola 1025U · V1a).
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ: todo lo que cambia el ORDEN o la PERTENENCIA de los iconos del dock, sin
 * React ni DOM: la lista de entradas que se pintan (iconos sueltos y carpetas),
 * mover un icono a otra posición, meterlo o sacarlo de una carpeta, quitarlo del
 * dock y devolverlo.
 * POR QUÉ: el estado que viaja con la cuenta es un array plano (`DockItemConfig[]`
 * en `starseed.dock.items.v2`) más las carpetas (`starseed.dock.folders.v1`). Lo
 * que ve la persona (un carril con carpetas intercaladas) NO es ese array: las
 * carpetas se colocan en el sitio de su primer icono y los apagados no se pintan.
 * Traducir «lo que arrastré a la posición 3 del carril» a «dónde va en el array»
 * es la parte delicada, y vive aquí para probarla sin navegador.
 *
 * Todas las funciones devuelven la MISMA referencia cuando no hay nada que cambiar,
 * para que quien guarde pueda comparar con `===` y no escribir de más.
 */

export interface ItemOrdenable {
  id: string;
  enabled: boolean;
}
export interface CarpetaOrdenable {
  id: string;
  itemIds: string[];
  enabled: boolean;
}

export type EntradaDock<I extends ItemOrdenable, C extends CarpetaOrdenable> =
  | { tipo: "item"; item: I }
  | { tipo: "carpeta"; carpeta: C; hijos: I[] };

/** Clave estable de una entrada del carril (la que lleva `data-dock-celda`). */
export function claveEntrada<I extends ItemOrdenable, C extends CarpetaOrdenable>(e: EntradaDock<I, C>): string {
  return e.tipo === "item" ? e.item.id : `carpeta:${e.carpeta.id}`;
}

/**
 * Lo que se pinta en el carril raíz, en orden. Es la MISMA regla que usaba el
 * OmniDock: los sueltos mantienen el orden de `items`; una carpeta se coloca donde
 * está su primer icono encendido; las carpetas sin ningún icono presente van al final
 * para poder gestionarlas.
 */
export function construirEntradas<I extends ItemOrdenable, C extends CarpetaOrdenable>(
  items: I[],
  carpetas: C[],
): EntradaDock<I, C>[] {
  const activas = carpetas.filter((f) => f.enabled);
  const plegados = new Set<string>();
  activas.forEach((f) => f.itemIds.forEach((id) => plegados.add(id)));
  const porId = new Map<string, I>();
  items.forEach((it) => porId.set(it.id, it));
  const hijosDe = (f: C): I[] =>
    f.itemIds.map((id) => porId.get(id)).filter((x): x is I => !!x && x.enabled);

  const entradas: EntradaDock<I, C>[] = [];
  const colocadas = new Set<string>();
  for (const it of items) {
    if (!it.enabled) continue;
    if (plegados.has(it.id)) {
      const dueña = activas.find((f) => f.itemIds.includes(it.id));
      if (dueña && !colocadas.has(dueña.id)) {
        colocadas.add(dueña.id);
        entradas.push({ tipo: "carpeta", carpeta: dueña, hijos: hijosDe(dueña) });
      }
      continue;
    }
    entradas.push({ tipo: "item", item: it });
  }
  for (const f of activas) {
    if (colocadas.has(f.id)) continue;
    entradas.push({ tipo: "carpeta", carpeta: f, hijos: hijosDe(f) });
  }
  return entradas;
}

/** Id del primer icono (en el orden del array) que ancla la posición de una entrada. */
function anclaDeEntrada<I extends ItemOrdenable, C extends CarpetaOrdenable>(
  e: EntradaDock<I, C>,
  items: I[],
): string | null {
  if (e.tipo === "item") return e.item.id;
  const miembros = new Set(e.carpeta.itemIds);
  const primero = items.find((it) => it.enabled && miembros.has(it.id));
  return primero ? primero.id : null;
}

/** Posición (1-based) y total del icono suelto en el carril raíz, para anunciarla. */
export function posicionEnRaiz<I extends ItemOrdenable, C extends CarpetaOrdenable>(
  items: I[],
  carpetas: C[],
  itemId: string,
): { posicion: number; total: number } | null {
  const entradas = construirEntradas(items, carpetas);
  const i = entradas.findIndex((e) => e.tipo === "item" && e.item.id === itemId);
  return i < 0 ? null : { posicion: i + 1, total: entradas.length };
}

/**
 * Mueve un icono suelto a `destino` dentro del carril raíz (0 = el primero).
 * `destino` es la posición FINAL que tendrá entre las entradas visibles.
 */
export function reordenarRaiz<I extends ItemOrdenable, C extends CarpetaOrdenable>(
  items: I[],
  carpetas: C[],
  itemId: string,
  destino: number,
): I[] {
  const entradas = construirEntradas(items, carpetas);
  const idx = entradas.findIndex((e) => e.tipo === "item" && e.item.id === itemId);
  if (idx < 0) return items;
  const resto = entradas.filter((_, i) => i !== idx);
  const d = Math.max(0, Math.min(Math.trunc(destino), resto.length));
  if (d === idx) return items;

  const movido = items.find((it) => it.id === itemId);
  if (!movido) return items;
  const sin = items.filter((it) => it.id !== itemId);

  let posicion: number; // índice en `sin` donde se inserta
  if (d < resto.length) {
    const ancla = anclaDeEntrada(resto[d], sin);
    const j = ancla === null ? -1 : sin.findIndex((it) => it.id === ancla);
    posicion = j < 0 ? sin.length : j;
  } else {
    posicion = sin.length;
  }
  const siguiente = [...sin.slice(0, posicion), movido, ...sin.slice(posicion)];
  return siguiente.every((it, i) => it === items[i]) ? items : siguiente;
}

/**
 * Reordena dentro de una carpeta. `destino` es la posición final entre los hijos
 * visibles (encendidos y existentes); los que no se ven conservan su pertenencia.
 */
export function reordenarEnCarpeta<I extends ItemOrdenable, C extends CarpetaOrdenable>(
  carpetas: C[],
  items: I[],
  carpetaId: string,
  itemId: string,
  destino: number,
): C[] {
  const carpeta = carpetas.find((f) => f.id === carpetaId);
  if (!carpeta || !carpeta.itemIds.includes(itemId)) return carpetas;
  const visibles = new Set(items.filter((it) => it.enabled).map((it) => it.id));
  const mostrados = carpeta.itemIds.filter((id) => visibles.has(id));
  const idx = mostrados.indexOf(itemId);
  if (idx < 0) return carpetas;
  const resto = mostrados.filter((id) => id !== itemId);
  const d = Math.max(0, Math.min(Math.trunc(destino), resto.length));
  if (d === idx) return carpetas;
  resto.splice(d, 0, itemId);
  const ocultos = carpeta.itemIds.filter((id) => !visibles.has(id));
  const nuevos = [...resto, ...ocultos];
  return carpetas.map((f) => (f.id === carpetaId ? { ...f, itemIds: nuevos } : f));
}

/** Mete un icono en una carpeta (al final). Un icono solo vive en una carpeta. */
export function meterEnCarpeta<C extends CarpetaOrdenable>(carpetas: C[], carpetaId: string, itemId: string): C[] {
  const destino = carpetas.find((f) => f.id === carpetaId);
  if (!destino) return carpetas;
  const yaEstaba = destino.itemIds.includes(itemId);
  const enOtra = carpetas.some((f) => f.id !== carpetaId && f.itemIds.includes(itemId));
  if (yaEstaba && !enOtra) return carpetas;
  return carpetas.map((f) => {
    if (f.id === carpetaId) return yaEstaba ? f : { ...f, itemIds: [...f.itemIds, itemId] };
    return f.itemIds.includes(itemId) ? { ...f, itemIds: f.itemIds.filter((x) => x !== itemId) } : f;
  });
}

/** Saca un icono de la carpeta que lo tenga: vuelve al carril raíz. */
export function sacarDeCarpeta<C extends CarpetaOrdenable>(carpetas: C[], itemId: string): C[] {
  if (!carpetas.some((f) => f.itemIds.includes(itemId))) return carpetas;
  return carpetas.map((f) => (f.itemIds.includes(itemId) ? { ...f, itemIds: f.itemIds.filter((x) => x !== itemId) } : f));
}

/** Carpeta que contiene el icono, si la hay. */
export function carpetaDe<C extends CarpetaOrdenable>(carpetas: C[], itemId: string): C | undefined {
  return carpetas.find((f) => f.itemIds.includes(itemId));
}

/** Quita el icono del dock (queda en el catálogo del editor, sigue en su carpeta si la tenía). */
export function quitarDelDock<I extends ItemOrdenable>(items: I[], itemId: string): I[] {
  if (!items.some((it) => it.id === itemId && it.enabled)) return items;
  return items.map((it) => (it.id === itemId ? { ...it, enabled: false } : it));
}

/** Deshace `quitarDelDock`: el icono vuelve exactamente a su sitio. */
export function devolverAlDock<I extends ItemOrdenable>(items: I[], itemId: string): I[] {
  if (!items.some((it) => it.id === itemId && !it.enabled)) return items;
  return items.map((it) => (it.id === itemId ? { ...it, enabled: true } : it));
}

// ───────────────────────── Geometría del arrastre ─────────────────────────

/** Una celda del carril medida en coordenadas de CONTENIDO (ya sumado el scroll). */
export interface CeldaMedida {
  clave: string;
  izq: number;
  ancho: number;
  /** Solo en las celdas que son una carpeta: su id. */
  carpeta?: string;
}

export interface ObjetivoSoltar {
  /** Posición final del icono entre las celdas del carril (0..n-1). */
  destino: number;
  /** Si el puntero está sobre el centro de una carpeta, su id: soltar ahí la mete dentro. */
  carpeta: string | null;
}

/** Fracción central del ancho de una carpeta en la que soltar significa «meter dentro». */
export const ZONA_CARPETA = 0.3;

/**
 * Dónde caería el icono arrastrado si se soltara con el puntero en `px`
 * (coordenada de contenido). `puedeEntrarEnCarpeta` es false para el carril
 * interior de una carpeta.
 */
export function objetivoDeSoltar(
  celdas: CeldaMedida[],
  origen: number,
  px: number,
  puedeEntrarEnCarpeta: boolean,
): ObjetivoSoltar {
  if (puedeEntrarEnCarpeta) {
    for (let i = 0; i < celdas.length; i++) {
      const c = celdas[i];
      if (i === origen || !c.carpeta) continue;
      const centro = c.izq + c.ancho / 2;
      if (Math.abs(px - centro) <= c.ancho * ZONA_CARPETA) return { destino: origen, carpeta: c.carpeta };
    }
  }
  let destino = 0;
  for (let i = 0; i < celdas.length; i++) {
    if (i === origen) continue;
    const centro = celdas[i].izq + celdas[i].ancho / 2;
    if (centro < px) destino++;
  }
  return { destino, carpeta: null };
}

/**
 * Cuánto se desplaza cada celda (en px, eje X) para abrir el hueco del icono
 * arrastrado: las que quedan entre el origen y el destino ceden un «paso».
 * La celda arrastrada (índice `origen`) devuelve 0: sigue al puntero por su cuenta.
 */
export function desplazamientosDeHueco(n: number, origen: number, destino: number, paso: number): number[] {
  const r = new Array<number>(n).fill(0);
  if (origen === destino) return r;
  for (let i = 0; i < n; i++) {
    if (i === origen) continue;
    if (origen < destino && i > origen && i <= destino) r[i] = -paso;
    else if (origen > destino && i >= destino && i < origen) r[i] = paso;
  }
  return r;
}

/** Paso del hueco: ancho de la celda arrastrada + el espacio que la separa de su vecina. */
export function pasoDeHueco(celdas: CeldaMedida[], origen: number): number {
  const c = celdas[origen];
  if (!c) return 0;
  const vecina = celdas[origen + 1] ?? null;
  if (vecina) return Math.max(0, vecina.izq - c.izq);
  const anterior = celdas[origen - 1] ?? null;
  if (anterior) return Math.max(0, c.izq - anterior.izq);
  return c.ancho;
}

/**
 * Desplazamiento X (px) que debe tener la celda arrastrada para quedar justo en su
 * hueco final, medido desde su sitio original. Es a donde «aterriza» al soltar.
 */
export function aterrizaje(celdas: CeldaMedida[], origen: number, destino: number): number {
  const c = celdas[origen];
  const t = celdas[destino];
  if (!c || !t || origen === destino) return 0;
  return origen < destino ? t.izq + t.ancho - (c.izq + c.ancho) : t.izq - c.izq;
}
