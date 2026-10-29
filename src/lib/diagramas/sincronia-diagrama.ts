// DGM1018N · Sincronía de la especificación de un diagrama (Ola 1018D).
// Viaja la especificación, nunca el HTML: cada neurona lo regenera. Fusión
// determinista de `salas/sincronia-sala.ts` y skill diagram-design (MIT,
// `vendor/habilidades/diagram-design/`; ver architecture/diagramas.md).
// «Contenido = entidad única»: se conservan los ids (nodo:<id>, arista:<id>,
// texto:<índice>) para referenciar, no duplicar. PURO: sin red, disco, reloj
// ni DOM; nada privado sale de la neurona de la persona.
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import type { Arista, Nodo } from "./importar";
export interface NodoEspecificacion extends Nodo { actualizadoEn?: number; porDispositivo?: string }
export interface AristaEspecificacion extends Arista { actualizadoEn?: number; porDispositivo?: string }
export interface EspecificacionDiagrama {
  id: string; tipo: string; nodos: NodoEspecificacion[]; aristas: AristaEspecificacion[];
  textos: string[]; colores?: Record<string, string>;
  /** Ids completos (`nodo:…`, `arista:…`, `texto:…`) que llevan lápida. */
  eliminados?: string[]; actualizadoEn?: number; porDispositivo?: string;
}
const P = { diagrama: "diagrama:", nodo: "nodo:", arista: "arista:", texto: "texto:" } as const;
const T = { diagrama: "diagrama", nodo: "diagrama-nodo", arista: "diagrama-arista", texto: "diagrama-texto" } as const;
type ConSello = { actualizadoEn?: number; porDispositivo?: string };
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const claveDe = (prefijo: string, id: string): string => (id.startsWith(prefijo) ? id.slice(prefijo.length) : id);
const compararPorId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const tipoDeId = (id: string): string => id.startsWith(P.nodo) ? T.nodo
  : id.startsWith(P.arista) ? T.arista : id.startsWith(P.texto) ? T.texto : T.diagrama;
const sello = (e: ConSello, autor: string, t: number): { actualizadoEn: number; porDispositivo: string } => ({
  actualizadoEn: typeof e.actualizadoEn === "number" && Number.isFinite(e.actualizadoEn) ? e.actualizadoEn : t,
  porDispositivo: e.porDispositivo?.trim() || autor,
});
/** Acepta el id completo o el id a secas de un nodo/arista de la misma especificación. */
function normalizarEliminado(bruto: string, espec: EspecificacionDiagrama): string {
  const id = bruto.trim();
  if (/^(diagrama|nodo|arista|texto):/.test(id)) return id;
  if ((espec.nodos ?? []).some((n) => n.id === id)) return `${P.nodo}${id}`;
  if ((espec.aristas ?? []).some((a) => a.id === id)) return `${P.arista}${id}`;
  if (/^\d+$/.test(id)) return `${P.texto}${id}`;
  return id;
}
function coloresDe(valor: unknown): Record<string, string> | undefined {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  const salida: Record<string, string> = {};
  for (const [clave, color] of Object.entries(valor)) if (typeof color === "string") salida[clave] = color;
  return Object.keys(salida).length > 0 ? salida : undefined;
}
const indiceDeTexto = (id: string): number => {
  const n = Number.parseInt(claveDe(P.texto, id), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama,
  autor: string,
  t: number,
): ElementoSala[] {
  const quien = autor.trim() || "anonimo";
  const instante = Number.isFinite(t) ? t : 0;
  const elementos = new Map<string, ElementoSala>();
  const elimina = new Set((espec.eliminados ?? []).map((id) => normalizarEliminado(id, espec)));
  const idDiagrama = `${P.diagrama}${espec.id}`;
  elementos.set(idDiagrama, { id: idDiagrama, tipo: T.diagrama,
    datos: { tipo: espec.tipo, colores: espec.colores ?? {} }, ...sello(espec, quien, instante) });
  for (const nodo of espec.nodos ?? []) {
    const id = `${P.nodo}${nodo.id}`;
    if (!elimina.has(id)) elementos.set(id, { id, tipo: T.nodo,
      datos: { etiqueta: nodo.etiqueta, forma: nodo.forma ?? "rect" }, ...sello(nodo, quien, instante) });
  }
  for (const arista of espec.aristas ?? []) {
    const id = `${P.arista}${arista.id}`;
    if (!elimina.has(id)) elementos.set(id, { id, tipo: T.arista,
      datos: { fuente: arista.fuente, destino: arista.destino, etiqueta: arista.etiqueta }, ...sello(arista, quien, instante) });
  }
  (espec.textos ?? []).forEach((contenido, i) => {
    const id = `${P.texto}${i}`;
    if (!elimina.has(id)) elementos.set(id, { id, tipo: T.texto, datos: { contenido }, actualizadoEn: instante, porDispositivo: quien });
  });
  // La lápida se queda en el mapa: si desapareciera, otra fusión resucitaría
  // el elemento borrado. Nunca se borra físicamente.
  for (const id of elimina) elementos.set(id, { id, tipo: tipoDeId(id), datos: {},
    actualizadoEn: instante, porDispositivo: quien, borrado: true });
  return [...elementos.values()];
}
export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const todos = Object.values(estado.elementos ?? {});
  const vivos = todos.filter((e) => !e.borrado);
  const meta = vivos.find((e) => e.tipo === T.diagrama);
  const datos = meta?.datos ?? {};
  const colores = coloresDe(datos.colores);
  const nodos = vivos.filter((e) => e.tipo === T.nodo).map((e) => ({
    id: claveDe(P.nodo, e.id), etiqueta: texto(e.datos.etiqueta), forma: texto(e.datos.forma) || "rect",
    actualizadoEn: e.actualizadoEn, porDispositivo: e.porDispositivo,
  })).sort(compararPorId);
  const aristas = vivos.filter((e) => e.tipo === T.arista).map((e) => ({
    id: claveDe(P.arista, e.id), fuente: texto(e.datos.fuente), destino: texto(e.datos.destino),
    etiqueta: texto(e.datos.etiqueta), actualizadoEn: e.actualizadoEn, porDispositivo: e.porDispositivo,
  })).sort(compararPorId);
  const textos = vivos.filter((e) => e.tipo === T.texto)
    .sort((a, b) => indiceDeTexto(a.id) - indiceDeTexto(b.id) || compararPorId(a, b))
    .map((e) => texto(e.datos.contenido));
  return { id: estado.salaId, tipo: texto(datos.tipo) || "architecture", nodos, aristas, textos,
    ...(colores ? { colores } : {}),
    eliminados: todos.filter((e) => e.borrado).map((e) => e.id).sort(),
    ...(meta ? { actualizadoEn: meta.actualizadoEn, porDispositivo: meta.porDispositivo } : {}) };
}
function estadoDe(espec: EspecificacionDiagrama, autor: string, t: number): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (const elemento of elementosDeEspecificacion(espec, autor, t)) elementos[elemento.id] = elemento;
  return { salaId: espec.id, elementos, reloj: t };
}
/** Fusiona dos especificaciones y devuelve la misma pieza recompuesta. */
export function fusionarEspecificaciones(
  local: EspecificacionDiagrama,
  remoto: EspecificacionDiagrama,
  miDispositivo: string,
): { especificacion: EspecificacionDiagrama; conflictos: string[] } {
  const t = Math.max(local.actualizadoEn ?? 0, remoto.actualizadoEn ?? 0);
  const { resultado, conflictos } = fusionarEstados(
    estadoDe(local, miDispositivo, t), estadoDe(remoto, remoto.porDispositivo?.trim() || "remoto", t), miDispositivo);
  return { especificacion: especificacionDeEstado(resultado), conflictos };
}
