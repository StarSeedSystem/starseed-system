// GENESIS · CONECTORES · CONTRATO PURO (Ola 1019G · GCA1019L). Sin red, disco ni reloj; solo nombres de variables y huellas.

import type { Asignacion } from "./asignaciones";
import type { Gratis, Licencia, OpcionCatalogo, Papel, Privacidad } from "./catalogo-opciones";

export interface AsignacionPublica { clave: string; cadena: string[]; verificado: boolean | null }
export interface OpcionPublica {
  id: string; nombre: string; tipo: OpcionCatalogo["tipo"]; papeles: Papel[];
  gratis: Gratis | null; requiereCuenta: boolean; enlaceAlta: string | null;
  enlaceClave: string | null; variables: string[]; privacidad: Privacidad;
  licencia: Licencia | null; verificado: string | null;
}
export type CuerpoVincular = { accion: "vincular"; proveedor: string; valor: string };
export type CuerpoAsignar = { accion: "asignar"; clave: string; cadena: string[] };
export type CuerpoConectores = CuerpoVincular | CuerpoAsignar;
const PAPELES: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];
const MAX_CADENA = 20;
const texto = (v: unknown, max: number): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.length <= max ? t : null;
};

export function ambitoDeUrl(url: string): string | null {
  try {
    const v = new URL(url).searchParams.get("ambito")?.trim() ?? "";
    return v && v.length <= 120 ? v : null;
  } catch {
    return null;
  }
}

export function leerCuerpo(crudo: string, maximo = 64 * 1024): Record<string, unknown> | null {
  if (!crudo || crudo.length > maximo) return null;
  try {
    const v: unknown = JSON.parse(crudo);
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function cadenaValida(v: unknown): string[] | null {
  const crudos = typeof v === "string" ? [v] : Array.isArray(v) ? v : null;
  if (!crudos || crudos.length === 0 || crudos.length > MAX_CADENA) return null;
  const limpios: string[] = [];
  for (const c of crudos) {
    const id = typeof c === "string" ? c.trim() : "";
    if (!id || id.length > 200) return null;
    if (!limpios.includes(id)) limpios.push(id);
  }
  return limpios;
}

export function validarCuerpo(c: Record<string, unknown>): CuerpoConectores | { error: string } {
  if (c.accion === "vincular") {
    const proveedor = texto(c.proveedor, 100);
    const valor = typeof c.valor === "string" ? c.valor.trim() : "";
    return proveedor && valor
      ? { accion: "vincular", proveedor, valor }
      : { error: "Faltan campos obligatorios: proveedor, valor." };
  }
  if (c.accion === "asignar") {
    const clave = texto(c.clave, 100);
    const cadena = cadenaValida(c.cadena);
    return clave && cadena
      ? { accion: "asignar", clave, cadena }
      : { error: "Faltan campos obligatorios: clave, cadena." };
  }
  return { error: "Acción no soportada." };
}

export async function huellaDeValor(valor: string): Promise<string> {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(resumen)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function aOpcionPublica(o: OpcionCatalogo): OpcionPublica {
  return {
    id: o.id, nombre: o.nombre, tipo: o.tipo, papeles: [...o.papeles], gratis: o.gratis,
    requiereCuenta: o.requiereCuenta, enlaceAlta: o.enlaceAlta, enlaceClave: o.enlaceClave,
    variables: [...o.variables], privacidad: o.privacidad, licencia: o.licencia, verificado: o.verificado,
  };
}
export function catalogoPublico(
  catalogo: readonly OpcionCatalogo[],
  vinculadas: ReadonlySet<string>,
  asignaciones: readonly Asignacion<Papel>[],
): OpcionPublica[] {
  const papeles = new Set(asignaciones.map((a) => a.clave));
  return catalogo
    .filter((o) => !vinculadas.has(o.id) && o.privacidad !== "local")
    .filter((o) => papeles.size === 0 || o.papeles.some((p) => papeles.has(p)))
    .map(aOpcionPublica)
    .sort((a, b) => Number(a.gratis === null) - Number(b.gratis === null)
      || a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id));
}

export function aAsignacionPublica(fila: { clave?: unknown; cadena?: unknown }): AsignacionPublica | null {
  const clave = texto(fila.clave, 100);
  const cadena = cadenaValida(fila.cadena);
  return clave && cadena ? { clave, cadena, verificado: null } : null;
}

/** Papeles conocidos del catálogo, para validar filas de asignación. */
export function esPapel(v: unknown): v is Papel {
  return typeof v === "string" && (PAPELES as readonly string[]).includes(v);
}

/** Asignación de mando (`sugerir.ts`) desde una fila; `null` si el papel no existe. */
export function aAsignacionMando(fila: { clave?: unknown; cadena?: unknown }): Asignacion<Papel> | null {
  const cadena = cadenaValida(fila.cadena);
  if (!esPapel(fila.clave) || !cadena) return null;
  return {
    clave: fila.clave, cadena, respaldo: [],
    preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null },
  };
}
