/** StarSeed OS · Ola 1018D — sincronía de diagramas (architecture/diagramas.md
 * §3-4): por una sala NO viaja el HTML del diagrama (se regenera en cada
 * neurona) sino la ESPECIFICACIÓN: aquí se convierte en `ElementoSala`, se
 * recompone desde el estado fusionado y usa `fusionarEstados`; borrar es
 * LÁPIDA y lo compartido viaja en la `base`. PURO. (MIT: diagram-design). */
import { fusionarEstados, type ElementoSala, type EstadoSala } from "@/lib/salas/sincronia-sala";
import type { Arista, Grupo, Nodo } from "@/lib/diagramas/importar";

/** Especificación sincronizable de un diagrama: tipo (uno de los 45 de
 * diagram-design), título, nodos, aristas, grupos, textos y colores por id. */
export interface EspecificacionDiagrama {
  tipo: string;
  titulo?: string;
  nodos: Nodo[];
  aristas: Arista[];
  grupos: Grupo[];
  textos: string[];
  colores?: Record<string, string>;
}

const TIPO_BASE = "diagrama-espec", TIPO_NODO = "diagrama-nodo";
const TIPO_ARISTA = "diagrama-arista", TIPO_TEXTO = "diagrama-texto";
const ID_BASE = "base";
const TABLA = { nodo: "nodo:", arista: "arista:", texto: "texto:" } as const;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
/** Igualdad por contenido (datos pequeños y de forma estable). */
const mismaSerie = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/** ¿El id pertenece a esta capa (base, nodo, arista o texto) de diagrama? */
const esDeDiagrama = (id: string): boolean => id === ID_BASE ||
  id.startsWith(TABLA.nodo) || id.startsWith(TABLA.arista) || id.startsWith(TABLA.texto);
/** Elemento nuevo con la marca del autor (tiempo t). */
const marcaDe = (id: string, tipo: string, datos: Record<string, unknown>, autor: string, t: number): ElementoSala =>
  ({ id, tipo, datos, actualizadoEn: t, porDispositivo: autor });

/** Lecturas defensivas de un `Nodo` / una `Arista` guardados en `datos`. */
const nodoDe = (d: Record<string, unknown>): Nodo => ({
  id: String(d["id"] ?? ""), etiqueta: String(d["etiqueta"] ?? ""),
  ...(typeof d["forma"] === "string" ? { forma: d["forma"] as string } : {}),
});
const aristaDe = (d: Record<string, unknown>): Arista => ({
  id: String(d["id"] ?? ""), fuente: String(d["fuente"] ?? ""),
  destino: String(d["destino"] ?? ""), etiqueta: String(d["etiqueta"] ?? ""),
});

/** Convierte cada nodo, arista y texto en `ElementoSala` (más la `base` con
 * tipo/título/colores/grupos) con marca (t, autor); lo sin cambios conserva
 * su marca y lo ausente emite LÁPIDA para no resucitarse. */
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama, autor: string, t: number, previos?: readonly ElementoSala[],
): ElementoSala[] {
  const entrada: ElementoSala[] = [ marcaDe(ID_BASE, TIPO_BASE,
    { tipo: espec.tipo, titulo: espec.titulo ?? "", colores: espec.colores, grupos: espec.grupos }, autor, t) ];
  for (const n of espec.nodos ?? []) entrada.push(marcaDe(`${TABLA.nodo}${n.id}`, TIPO_NODO, { ...n }, autor, t));
  for (const a of espec.aristas ?? []) entrada.push(marcaDe(`${TABLA.arista}${a.id}`, TIPO_ARISTA, { ...a }, autor, t));
  (espec.textos ?? []).forEach((texto, i) => entrada.push(marcaDe(`${TABLA.texto}${i}`, TIPO_TEXTO, { texto }, autor, t)));
  const previosPorId = new Map((previos ?? []).map((p) => [p.id, p] as const));
  const salida = entrada.map((e) => {
    const previo = previosPorId.get(e.id);
    // Sin cambios de contenido → mismo elemento con su marca anterior.
    return previo && !previo.borrado && mismaSerie(previo.datos, e.datos) ? { ...previo } : e;
  });
  for (const [id, p] of previosPorId) {
    // Lápida respecto de los previos: ya no está en la especificación.
    if (esDeDiagrama(id) && !entrada.some((e) => e.id === id) && !p.borrado)
      salida.push({ ...p, actualizadoEn: t, porDispositivo: autor, borrado: true });
  }
  return salida;
}

/** Aplica la especificación del AUTOR a su estado previo de la sala: devuelve
 * el `EstadoSala` nuevo (lápidas incluidas) para emitirlo y fusionarlo en las
 * demás neuronas con `fusionarEspecificacion`. */
export function estadoDeEspecificacion(
  anterior: EstadoSala | undefined, espec: EspecificacionDiagrama, autor: string, t: number,
): EstadoSala {
  const previos = anterior ? Object.values(anterior.elementos ?? {}) : undefined;
  const elementos: Record<string, ElementoSala> = { ...(anterior?.elementos ?? {}) };
  for (const e of elementosDeEspecificacion(espec, autor, t, previos)) {
    const actual = elementos[e.id];
    if (!actual || e.actualizadoEn > actual.actualizadoEn || actual.porDispositivo === autor) elementos[e.id] = e;
  }
  return { salaId: anterior?.salaId ?? "", elementos, reloj: Math.max(anterior?.reloj ?? 0, t) };
}

/** Recompone la especificación desde un estado de sala (ignora lápidas). */
export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const elems = Object.values(estado?.elementos ?? {}).filter((e) => !e.borrado);
  const base = elems.find((e) => e.id === ID_BASE);
  const datosBase = esObjeto(base?.datos) ? base.datos : {};
  const porTipo = (t: string) => elems.filter((e) => e.tipo === t).sort((x, y) => (x.id < y.id ? -1 : 1));
  const nodos: Nodo[] = porTipo(TIPO_NODO).filter((e) => esObjeto(e.datos)).map((e) => nodoDe(e.datos));
  const idsNodo = new Set(nodos.map((n) => n.id));
  // Una arista sin sus dos extremos ya no une nada: no se recompone.
  const aristas: Arista[] = porTipo(TIPO_ARISTA).filter((e) => esObjeto(e.datos)).map((e) => aristaDe(e.datos))
    .filter((a) => idsNodo.has(a.fuente) && idsNodo.has(a.destino));
  const textos = elems.filter((e) => e.tipo === TIPO_TEXTO).map((e) => ({ i: Number(e.id.slice(TABLA.texto.length)), e }))
    .sort((x, y) => (Number.isFinite(x.i) ? x.i : Infinity) - (Number.isFinite(y.i) ? y.i : Infinity))
    .map((x) => (esObjeto(x.e.datos) ? String(x.e.datos["texto"] ?? "") : ""));
  const crudosColores = esObjeto(datosBase["colores"]) ? datosBase["colores"] : {};
  const colores = Object.fromEntries(Object.entries(crudosColores).filter((x): x is [string, string] => typeof x[1] === "string"));
  const grupos: Grupo[] = (Array.isArray(datosBase["grupos"]) ? datosBase["grupos"] : []).filter(esObjeto).map((g) => ({
    id: String(g["id"] ?? ""), etiqueta: String(g["etiqueta"] ?? ""),
    nodos: Array.isArray(g["nodos"]) ? g["nodos"].filter((v): v is string => typeof v === "string") : [],
  }));
  return {
    tipo: String(datosBase["tipo"] ?? ""),
    ...(typeof datosBase["titulo"] === "string" && datosBase["titulo"] ? { titulo: datosBase["titulo"] } : {}),
    nodos, aristas, grupos, textos, ...(Object.keys(colores).length > 0 ? { colores } : {}),
  };
}

/** Punto de recepción: fusiona el estado llegado de otra neurona con el nuestro
 * (`fusionarEstados`, determinista) y devuelve la especificación recompuesta,
 * de la que cada neurona regenera su HTML. */
export function fusionarEspecificacion(
  local: EstadoSala, entrante: EstadoSala, miDispositivo: string,
): { resultado: EstadoSala; conflictos: string[]; especificacion: EspecificacionDiagrama } {
  const fusion = fusionarEstados(local, entrante, miDispositivo);
  return { resultado: fusion.resultado, conflictos: fusion.conflictos, especificacion: especificacionDeEstado(fusion.resultado) };
}
