/**
 * Sincronía de diagramas (architecture/diagramas.md §3-6): la entidad única
 * se REFERENCIA (`datos.espec`), nunca se duplica (skill MIT diagram-design).
 * La fusión es la MISMA `fusionarEstados` de src/lib/salas; borrado = lápida.
 */
import { fusionarEstados, type ElementoSala, type EstadoSala } from "@/lib/salas/sincronia-sala";
import type { Arista, Nodo } from "./importar";

/** La especificación compuesta que la vista vuelve a dibujar en cada neurona. */
export interface EspecificacionDiagrama {
  /** Entidad única: compartir es referenciar este id, nunca duplicar. */
  id: string;
  /** Tipo de la skill diagram-design (arquitectura, flujo, despiece, XR…). */
  tipo: string;
  titulo?: string;
  nodos: Nodo[];
  aristas: Arista[];
  textos: string[];
  /** Tema del contexto: SOLO NOMBRES de variables de entorno (nunca valores). */
  tema?: Record<string, string>;
}

type DatosDiagrama = {
  espec: string; campo: "espec" | "nodo" | "arista" | "texto"; nombre: string; pos: number;
  valor?: unknown; tipo?: string; titulo?: string; tema?: Record<string, string>;
};

/** Id determinista, el mismo en todas las neuronas; «:», «/» y espacios fuera. */
const idDe = (especId: string, campo: string, nombre: string): string =>
  `${especId}:${campo}:${(nombre ?? "").replace(/[:/\s]/g, "_") || "-"}`;
/** Lectura defensiva de los datos del elemento (pueden llegar de la red). */
const datosDe = (e?: ElementoSala): DatosDiagrama | undefined =>
  e?.datos && typeof e.datos["espec"] === "string" ? (e.datos as DatosDiagrama) : undefined;
/** ¿v guarda un nodo o arista del importador? (cast parcial, nunca `any`.) */
const esNodo = (v: unknown): v is Nodo =>
  typeof (v as Partial<Nodo> | undefined)?.id === "string" && typeof (v as Partial<Nodo> | undefined)?.etiqueta === "string";
const esArista = (v: unknown): v is Arista =>
  typeof (v as Partial<Arista> | undefined)?.id === "string" && typeof (v as Partial<Arista> | undefined)?.etiqueta === "string" &&
  typeof (v as Partial<Arista> | undefined)?.fuente === "string" && typeof (v as Partial<Arista> | undefined)?.destino === "string";

/** Un elemento de la sala para una pieza del diagrama. */
function elementoDe(
  espec: EspecificacionDiagrama, campo: DatosDiagrama["campo"], nombre: string,
  pos: number, valor: unknown, autor: string, t: number,
): ElementoSala {
  const datos: DatosDiagrama = campo === "espec"
    ? { espec: espec.id, campo, nombre, pos, valor, tipo: espec.tipo, titulo: espec.titulo, tema: espec.tema }
    : { espec: espec.id, campo, nombre, pos, valor };
  return { id: idDe(espec.id, campo, nombre), tipo: `diagrama:${campo}`, datos, actualizadoEn: t, porDispositivo: autor || "anonimo" };
}

/** Especificación → elementos de sala (cabecera, nodos, aristas y textos);
 *  cada pieza se pliega por `fusionarEstados`, como en sincronia-video.ts. */
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama, autor: string, t: number,
): ElementoSala[] {
  const piezas: ElementoSala[] = [elementoDe(espec, "espec", "espec", 0, undefined, autor, t)];
  espec.nodos.forEach((n, p) => piezas.push(elementoDe(espec, "nodo", n.id, p, n, autor, t)));
  espec.aristas.forEach((a, p) => piezas.push(elementoDe(espec, "arista", a.id, p, a, autor, t)));
  espec.textos.forEach((x, p) => piezas.push(elementoDe(espec, "texto", `t${p}`, p, x, autor, t)));
  let local: EstadoSala = { salaId: "diagrama", elementos: {}, reloj: 0 };
  for (const pieza of piezas) {
    local = fusionarEstados(local, { salaId: "diagrama", elementos: { [pieza.id]: pieza }, reloj: pieza.actualizadoEn }, "").resultado;
  }
  return Object.values(local.elementos ?? {});
}

/** Emisión mínima al EDITAR: lo intacto conserva su marca original, lo nuevo
 *  sale con «t» y lo quitado es lápida (borrado físico nunca: no resucita). */
export function elementosDeEdicion(
  estadoPrevia: EstadoSala, especNueva: EspecificacionDiagrama, autor: string, t: number,
): ElementoSala[] {
  const previos: Record<string, ElementoSala> = {};
  for (const [id, e] of Object.entries(estadoPrevia.elementos ?? {})) {
    if (datosDe(e)?.espec === especNueva.id) previos[id] = e;
  }
  const nuevos = new Map(elementosDeEspecificacion(especNueva, autor, t).map((e): [string, ElementoSala] => [e.id, e]));
  const salida: ElementoSala[] = [];
  for (const [id, nuevo] of nuevos) {
    const previo = previos[id];
    salida.push(previo && !previo.borrado && JSON.stringify(previo.datos) === JSON.stringify(nuevo.datos) ? previo : nuevo);
  }
  for (const [id, previo] of Object.entries(previos)) {
    if (!nuevos.has(id)) salida.push({ ...previo, borrado: true, actualizadoEn: t, porDispositivo: autor || "anonimo" });
  }
  return salida;
}

/** Estado fusionado → especificación: manda la cabecera viva más nueva, los
 *  vivos se ordenan por «pos» y las lápidas desaparecen. Converge igual. */
export function especificacionDeEstado(
  estado: EstadoSala, especId?: string,
): EspecificacionDiagrama | null {
  const vivos = Object.values(estado.elementos ?? {}).filter((e) => !e.borrado);
  const cabecera = vivos
    .filter((e) => datosDe(e)?.campo === "espec" && (!especId || datosDe(e)?.espec === especId))
    .sort((a, b) => b.actualizadoEn - a.actualizadoEn || a.porDispositivo.localeCompare(b.porDispositivo))[0];
  const d = datosDe(cabecera);
  if (!d) return null;
  const porPos = (x: ElementoSala, y: ElementoSala): number =>
    (datosDe(x)?.pos ?? 0) - (datosDe(y)?.pos ?? 0) ||
    (datosDe(x)?.nombre ?? "").localeCompare(datosDe(y)?.nombre ?? "");
  const salida: EspecificacionDiagrama = { id: d.espec, tipo: d.tipo ?? "arquitectura", nodos: [], aristas: [], textos: [] };
  if (typeof d.titulo === "string") salida.titulo = d.titulo;
  if (d.tema && Object.values(d.tema).every((s) => typeof s === "string")) salida.tema = d.tema;
  const vistasNodo = new Set<string>();
  const vistasArista = new Set<string>();
  for (const e of vivos.filter((e) => datosDe(e)?.espec === d.espec).sort(porPos)) {
    const dd = datosDe(e); if (!dd || dd.campo === "espec") continue;
    if (dd.campo === "texto") {
      if (typeof dd.valor === "string") salida.textos.push(dd.valor);
    } else if (dd.campo === "nodo") {
      if (esNodo(dd.valor) && !vistasNodo.has(dd.valor.id)) { salida.nodos.push(dd.valor); vistasNodo.add(dd.valor.id); }
    } else if (esArista(dd.valor) && !vistasArista.has(dd.valor.id)) {
      salida.aristas.push(dd.valor); vistasArista.add(dd.valor.id);
    }
  }
  return salida;
}
