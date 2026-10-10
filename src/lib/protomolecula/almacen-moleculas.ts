import type { Ambito, Molecula } from "./tipos";

export interface AlmacenLocal {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const PREFIJO_MOLECULA = "starseed.protomolecula.molecula.v1:";
export const CLAVE_INDICE = "starseed.protomolecula.indice.v1";

const TAMANO_MAXIMO_BYTES = 256 * 1024;

export interface ResumenMolecula {
  id: string;
  titulo: string;
  ambito: Ambito;
  actualizadaEn: number;
}

export function esAmbito(x: unknown): x is Ambito {
  return x === "personal" || x === "publico" || x === "privado" || x === "grupo";
}

export function esObjetoPlano(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function esTexto(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function esNumero(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function esCapaValida(x: unknown): boolean {
  return esObjetoPlano(x) && esTexto(x.id) && esTexto(x.nombre);
}

function esAtomoValido(x: unknown): boolean {
  return esObjetoPlano(x) && esTexto(x.id) && esTexto(x.capaId) && esTexto(x.tipo);
}

function esValorValido(x: unknown): boolean {
  return typeof x === "number" || typeof x === "boolean" || typeof x === "string";
}

export function esMoleculaValida(x: unknown): x is Molecula {
  if (!esObjetoPlano(x)) return false;
  if (!esTexto(x.id) || typeof x.titulo !== "string") return false;
  if (!esAmbito(x.ambito)) return false;
  if (!Array.isArray(x.capas) || !x.capas.every(esCapaValida)) return false;
  if (!Array.isArray(x.atomos) || !x.atomos.every(esAtomoValido)) return false;
  if (!esObjetoPlano(x.valores) || !Object.values(x.valores).every(esValorValido)) return false;
  if (!esNumero(x.version) || !esNumero(x.creadaEn) || !esNumero(x.actualizadaEn)) return false;
  try {
    if (JSON.stringify(x).length > TAMANO_MAXIMO_BYTES) return false;
  } catch {
    return false;
  }
  return true;
}

export function almacenNavegador(): AlmacenLocal | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

interface Indice {
  ids: string[];
}

function leerIndice(a: AlmacenLocal): Indice {
  try {
    const crudo = a.getItem(CLAVE_INDICE);
    if (crudo === null) return { ids: [] };
    const parsed: unknown = JSON.parse(crudo);
    if (!esObjetoPlano(parsed) || !Array.isArray(parsed.ids)) return { ids: [] };
    return { ids: parsed.ids.filter((id): id is string => esTexto(id)) };
  } catch {
    return { ids: [] };
  }
}

function escribirIndice(a: AlmacenLocal, indice: Indice): void {
  a.setItem(CLAVE_INDICE, JSON.stringify(indice));
}

export function guardarMolecula(a: AlmacenLocal, m: Molecula): boolean {
  if (!esMoleculaValida(m)) return false;
  try {
    a.setItem(PREFIJO_MOLECULA + m.id, JSON.stringify(m));
    const indice = leerIndice(a);
    if (!indice.ids.includes(m.id)) indice.ids.push(m.id);
    escribirIndice(a, indice);
    return true;
  } catch {
    return false;
  }
}

export function cargarMolecula(a: AlmacenLocal, id: string): Molecula | null {
  try {
    const crudo = a.getItem(PREFIJO_MOLECULA + id);
    if (crudo === null) return null;
    const parsed: unknown = JSON.parse(crudo);
    return esMoleculaValida(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function listarMoleculas(a: AlmacenLocal): ResumenMolecula[] {
  try {
    const resumenes: ResumenMolecula[] = [];
    for (const id of leerIndice(a).ids) {
      const m = cargarMolecula(a, id);
      if (m !== null) {
        resumenes.push({ id: m.id, titulo: m.titulo, ambito: m.ambito, actualizadaEn: m.actualizadaEn });
      }
    }
    resumenes.sort((x, y) => y.actualizadaEn - x.actualizadaEn);
    return resumenes;
  } catch {
    return [];
  }
}

export function borrarMolecula(a: AlmacenLocal, id: string): boolean {
  try {
    const indice = leerIndice(a);
    if (!indice.ids.includes(id)) return false;
    a.removeItem(PREFIJO_MOLECULA + id);
    escribirIndice(a, { ids: indice.ids.filter((x) => x !== id) });
    return true;
  } catch {
    return false;
  }
}
