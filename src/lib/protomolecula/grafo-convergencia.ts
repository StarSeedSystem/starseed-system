/**
 * Protomolécula · GRAFO DE CONVERGENCIA. §3.3 del contrato: dos programas no se mezclan
 * por dentro; intercambian exportaciones y la molécula las REFERENCIA. Este módulo puro
 * analiza el grafo de átomos (en una pizarra, las `CanvasEdge` entre ventanas):
 * orden de ejecución (Kahn estable), ciclos (SCC de Tarjan) y salidas incompatibles.
 */
import type { DefinicionAtomo } from "./registro-atomos";

export interface Arista {
  de: string;
  a: string;
}

export interface AtomoRef {
  id: string;
  herramientaId: string;
}

export interface Incompatible {
  arista: Arista;
  salidas: string[];
  entradas: string[];
}

export interface Conversion {
  arista: Arista;
  /** Formatos intermedios (o la pareja salida→entrada) que resuelven la arista. */
  ruta: string[];
}

export interface Diagnostico {
  ok: boolean;
  /** Orden topológico de ejecución; con ciclos incluye solo lo ordenable. */
  orden: string[];
  /** Cada ciclo como lista de ids de átomo. */
  ciclos: string[][];
  incompatibles: Incompatible[];
  conversiones: Conversion[];
  avisos: string[];
}

/** Formatos normalizados: minúsculas y sin punto inicial (".PNG" → "png"). */
export function normalizarFormato(f: string): string {
  return f.trim().toLowerCase().replace(/^\.+/, "");
}

function listaNormalizada(xs: string[] | undefined): string[] {
  return (xs ?? []).map(normalizarFormato);
}

/** Kahn con desempate por el orden de entrada de `atomos`. Devuelve lo ordenable. */
function ordenTopologico(ids: string[], aristas: Arista[]): string[] {
  const indice = new Map(ids.map((id, i) => [id, i]));
  const grado = new Map<string, number>(ids.map((id) => [id, 0]));
  const salientes = new Map<string, string[]>();
  for (const e of aristas) {
    if (!grado.has(e.de) || !grado.has(e.a) || e.de === e.a) continue;
    grado.set(e.a, (grado.get(e.a) ?? 0) + 1);
    salientes.set(e.de, [...(salientes.get(e.de) ?? []), e.a]);
  }
  const listos = ids.filter((id) => (grado.get(id) ?? 0) === 0);
  const orden: string[] = [];
  while (listos.length > 0) {
    listos.sort((x, y) => (indice.get(x) ?? 0) - (indice.get(y) ?? 0));
    const id = listos.shift() as string;
    orden.push(id);
    for (const sig of salientes.get(id) ?? []) {
      const g = (grado.get(sig) ?? 0) - 1;
      grado.set(sig, g);
      if (g === 0) listos.push(sig);
    }
  }
  return orden;
}

/** Componentes fuertemente conexas (Tarjan); cada una de tamaño > 1, o un auto-bucle, es un ciclo. */
function encontrarCiclos(ids: string[], aristas: Arista[]): string[][] {
  const salientes = new Map<string, string[]>();
  for (const e of aristas) {
    salientes.set(e.de, [...(salientes.get(e.de) ?? []), e.a]);
  }
  const idx = new Map<string, number>();
  const bajo = new Map<string, number>();
  const enPila = new Set<string>();
  const pila: string[] = [];
  const ciclos: string[][] = [];
  let contador = 0;

  const visitar = (v: string): void => {
    idx.set(v, contador);
    bajo.set(v, contador);
    contador += 1;
    pila.push(v);
    enPila.add(v);
    for (const w of salientes.get(v) ?? []) {
      if (!ids.includes(w)) continue;
      if (!idx.has(w)) {
        visitar(w);
        bajo.set(v, Math.min(bajo.get(v) ?? 0, bajo.get(w) ?? 0));
      } else if (enPila.has(w)) {
        bajo.set(v, Math.min(bajo.get(v) ?? 0, idx.get(w) ?? 0));
      }
    }
    if (bajo.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w = "";
      do {
        w = pila.pop() as string;
        enPila.delete(w);
        comp.push(w);
      } while (w !== v);
      const autoBucle = comp.length === 1 && (salientes.get(v) ?? []).includes(v);
      if (comp.length > 1 || autoBucle) ciclos.push(comp);
    }
  };

  for (const id of ids) if (!idx.has(id)) visitar(id);
  return ciclos;
}

/**
 * Analiza el grafo: compatibilidad de formatos entre aristas (directa o vía `rutaDe`),
 * orden de ejecución y ciclos. `rutaDe(salida, entrada)` devuelve los formatos
 * intermedios de la conversión, o null si no hay camino.
 */
export function analizarConvergencia(
  atomos: AtomoRef[],
  aristas: Arista[],
  definicion: (herramientaId: string) => DefinicionAtomo | undefined,
  rutaDe: (de: string, a: string) => string[] | null,
): Diagnostico {
  const avisos: string[] = [];
  const incompatibles: Incompatible[] = [];
  const conversiones: Conversion[] = [];
  const porId = new Map(atomos.map((a) => [a.id, a]));
  const aristasValidas: Arista[] = [];

  for (const arista of aristas) {
    const origen = porId.get(arista.de);
    const destino = porId.get(arista.a);
    if (!origen || !destino) {
      avisos.push(
        `La arista ${arista.de} → ${arista.a} apunta a un átomo que no está en la molécula; se ignora.`,
      );
      continue;
    }
    aristasValidas.push(arista);

    const defOrigen = definicion(origen.herramientaId);
    const defDestino = definicion(destino.herramientaId);
    if (!defOrigen || !defDestino) {
      const falta = !defOrigen ? origen.herramientaId : destino.herramientaId;
      avisos.push(`Herramienta desconocida: ${falta}. No se puede comprobar la arista ${arista.de} → ${arista.a}.`);
      incompatibles.push({ arista, salidas: [], entradas: [] });
      continue;
    }

    const salidas = listaNormalizada(defOrigen.salidas);
    const entradas = listaNormalizada(defDestino.entradas);
    if (entradas.length === 0) {
      avisos.push(`La herramienta ${defDestino.nombre} no recibe archivos.`);
      incompatibles.push({ arista, salidas, entradas });
      continue;
    }
    if (salidas.some((s) => entradas.includes(s))) continue; // compatible directa

    let ruta: string[] | null = null;
    for (const s of salidas) {
      for (const e of entradas) {
        ruta = rutaDe(s, e);
        if (ruta) break;
      }
      if (ruta) break;
    }
    if (ruta) {
      conversiones.push({ arista, ruta: ruta.map(normalizarFormato) });
    } else {
      avisos.push(
        `Sin conversión de ${defOrigen.nombre} (${salidas.join(", ") || "sin salidas"}) ` +
          `a ${defDestino.nombre} (${entradas.join(", ")}).`,
      );
      incompatibles.push({ arista, salidas, entradas });
    }
  }

  const ids = atomos.map((a) => a.id);
  const ciclos = encontrarCiclos(ids, aristasValidas);
  const orden = ordenTopologico(ids, aristasValidas);
  for (const ciclo of ciclos) {
    avisos.push(`Ciclo detectado entre átomos: ${ciclo.join(" → ")}. Rompe una arista para poder ejecutar.`);
  }

  return {
    ok: ciclos.length === 0 && incompatibles.length === 0,
    orden,
    ciclos,
    incompatibles,
    conversiones,
    avisos,
  };
}
