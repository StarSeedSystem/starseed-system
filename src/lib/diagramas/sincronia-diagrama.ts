/**
 * StarSeed OS · Diagramas · edición en grupo (Ola 1018D).
 * Se sincroniza la ESPECIFICACIÓN (tipo, nodos, aristas, textos y colores), no
 * el HTML: cada neurona lo regenera. Contenido = entidad única: cada pieza viaja
 * como `ElementoSala` referenciada por id y se fusiona con la misma regla de
 * `sincronia-sala.ts`. Skill MIT diagram-design (vendor/habilidades/diagram-design/);
 * contrato en architecture/diagramas.md §3.6. Módulo PURO: sin red, sin disco ni reloj.
 */
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
/** Revisión de un elemento: editar uno no debe reescribir los demás. */
interface Revision { actualizadoEn?: number; porDispositivo?: string; }
export interface NodoDiagrama extends Revision {
  id: string; etiqueta: string; forma?: string; color?: string;
}
export interface AristaDiagrama extends Revision {
  id: string; fuente: string; destino: string; etiqueta?: string; color?: string;
}
export interface TextoDiagrama extends Revision {
  id: string; contenido: string; color?: string;
}
export interface EspecificacionDiagrama {
  tipo: string;
  nodos: NodoDiagrama[];
  aristas: AristaDiagrama[];
  textos: TextoDiagrama[];
  colores?: Record<string, string>;
  /** Ids ya prefijados (`nodo:`, `arista:`, `texto:`) que se borraron. */
  borrados?: string[];
}
const SALA = "diagrama";
/** Centinela: nunca coincide con un autor real, así no se ignora ningún eco. */
const LOCAL = "\u0000local";
const PREFIJO = { nodo: "nodo:", arista: "arista:", texto: "texto:" } as const;
function elemento(
  id: string, tipo: string, datos: Record<string, unknown>,
  autor: string, t: number, revision: Revision = {},
): ElementoSala {
  return {
    id, tipo, datos,
    actualizadoEn: revision.actualizadoEn ?? t,
    porDispositivo: revision.porDispositivo ?? autor,
  };
}
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama, autor: string, t: number,
): ElementoSala[] {
  const candidatos: ElementoSala[] = [
    elemento("diagrama", "diagrama", { tipo: espec.tipo, colores: espec.colores ?? {} }, autor, t),
  ];
  espec.nodos.forEach((n, i) => candidatos.push(elemento(
    PREFIJO.nodo + n.id, "nodo", { ...n, orden: i }, autor, t + i, n)));
  espec.aristas.forEach((a, i) => candidatos.push(elemento(
    PREFIJO.arista + a.id, "arista", { ...a, orden: i }, autor, t + i, a)));
  espec.textos.forEach((x, i) => candidatos.push(elemento(
    PREFIJO.texto + x.id, "texto", { ...x, orden: i }, autor, t + i, x)));
  // Ausencia no es borrado: solo se emite lápida para lo marcado en `borrados`.
  const base = t + candidatos.length;
  (espec.borrados ?? []).forEach((id, i) => candidatos.push({
    id, tipo: id.split(":")[0] ?? "", datos: {},
    actualizadoEn: base + i, porDispositivo: autor, borrado: true,
  }));
  let local: EstadoSala = { salaId: SALA, elementos: {}, reloj: 0 };
  for (const c of candidatos) {
    const remoto: EstadoSala = { salaId: SALA, elementos: { [c.id]: c }, reloj: c.actualizadoEn };
    local = fusionarEstados(local, remoto, LOCAL).resultado;
  }
  return Object.values(local.elementos);
}
function opcional(valor: unknown): string | undefined {
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}
function coloresDe(valor: unknown): Record<string, string> | undefined {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  const salida: Record<string, string> = {};
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof v === "string") salida[clave] = v;
  }
  return salida;
}
function copiar<T extends Revision>(base: T, e: ElementoSala, campos: readonly string[]): T {
  const salida = { ...base };
  for (const campo of campos) {
    const valor = opcional(e.datos?.[campo]);
    if (valor) Object.assign(salida, { [campo]: valor });
  }
  return salida;
}
function reconstruir<T extends Revision>(estado: EstadoSala, tipo: string, prefijo: string,
  crear: (e: ElementoSala, id: string) => T): T[] {
  return Object.values(estado.elementos ?? {})
    .filter((e) => !e.borrado && e.tipo === tipo)
    .sort((a, b) =>
      Number(a.datos?.orden ?? 0) - Number(b.datos?.orden ?? 0) || a.id.localeCompare(b.id))
    .map((e) => ({
      ...crear(e, e.id.slice(prefijo.length)),
      actualizadoEn: e.actualizadoEn,
      porDispositivo: e.porDispositivo,
    }));
}
export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const todos = Object.values(estado.elementos ?? {});
  const meta = todos.find((e) => !e.borrado && e.tipo === "diagrama");
  const espec: EspecificacionDiagrama = {
    tipo: String(meta?.datos?.tipo ?? ""),
    nodos: reconstruir(estado, "nodo", PREFIJO.nodo, (e, id) =>
      copiar<NodoDiagrama>({ id, etiqueta: String(e.datos?.etiqueta ?? "") }, e, ["forma", "color"])),
    aristas: reconstruir(estado, "arista", PREFIJO.arista, (e, id) =>
      copiar<AristaDiagrama>(
        { id, fuente: String(e.datos?.fuente ?? ""), destino: String(e.datos?.destino ?? "") },
        e, ["etiqueta", "color"])),
    textos: reconstruir(estado, "texto", PREFIJO.texto, (e, id) =>
      copiar<TextoDiagrama>({ id, contenido: String(e.datos?.contenido ?? "") }, e, ["color"])),
  };
  const colores = coloresDe(meta?.datos?.colores);
  if (colores) espec.colores = colores;
  const borrados = todos.filter((e) => e.borrado).map((e) => e.id).sort();
  if (borrados.length > 0) espec.borrados = borrados;
  return espec;
}
