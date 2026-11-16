import type { PaqueteIdioma } from "./formato";
import { normalizarTexto } from "../catalogo";

export const CLAVE_EDITOR = "starseed.idiomas.editor.v1" as const;
export const MAX_PENDIENTES = 2000;
export const MAX_LONGITUD_TEXTO = 500;

function hashSimple(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export interface EstadoEdicion {
  codigo: string;
  nombre: string;
  pendientes: string[];
  completadas: Record<string, string>;
}

type AlmacenInterno = {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
};

function obtenerAlmacen(): AlmacenInterno {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function leerEstado(almacen: AlmacenInterno): EstadoEdicion | null {
  try {
    const bruto = almacen.getItem(CLAVE_EDITOR);
    if (!bruto) return null;
    const parsed = JSON.parse(bruto);
    if (!parsed || typeof parsed.codigo !== "string") return null;
    return {
      codigo: parsed.codigo,
      nombre: parsed.nombre,
      pendientes: Array.isArray(parsed.pendientes) ? parsed.pendientes : [],
      completadas: parsed.completadas && typeof parsed.completadas === "object" ? parsed.completadas : {},
    };
  } catch {
    return null;
  }
}

function escribirEstado(almacen: AlmacenInterno, estado: EstadoEdicion): void {
  try {
    almacen.setItem(CLAVE_EDITOR, JSON.stringify(estado));
  } catch {
    // Si falla la escritura, la edición sigue en memoria
  }
}

function limpiarEstado(almacen: AlmacenInterno): void {
  try {
    almacen.removeItem(CLAVE_EDITOR);
  } catch {
    // Ignorar errores de limpieza
  }
}

let estadoMemoria: EstadoEdicion | null = null;

function obtenerEstado(): EstadoEdicion | null {
  if (estadoMemoria) return estadoMemoria;
  const almacen = obtenerAlmacen();
  estadoMemoria = leerEstado(almacen);
  return estadoMemoria;
}

function actualizarEstado(nuevo: EstadoEdicion | null): void {
  estadoMemoria = nuevo;
  const almacen = obtenerAlmacen();
  if (nuevo) {
    escribirEstado(almacen, nuevo);
  } else {
    limpiarEstado(almacen);
  }
}

export function abrirEdicion(codigo: string, nombre: string): void {
  const estado: EstadoEdicion = {
    codigo,
    nombre,
    pendientes: [],
    completadas: {},
  };
  actualizarEstado(estado);
}

export function paqueteEnEdicion(): EstadoEdicion | null {
  return obtenerEstado();
}

export function anadirPendiente(textoEspanol: string): void {
  const estado = obtenerEstado();
  if (!estado) return;

  const normalizado = normalizarTexto(textoEspanol);
  if (!normalizado) return;
  if (normalizado.length > MAX_LONGITUD_TEXTO) return;
  if (estado.pendientes.includes(normalizado)) return;
  if (estado.completadas[normalizado]) return;
  if (estado.pendientes.length >= MAX_PENDIENTES) return;

  estado.pendientes.push(normalizado);
  actualizarEstado(estado);
}

export function traducir(clave: string, valor: string): void {
  const estado = obtenerEstado();
  if (!estado) return;

  const enPendientes = estado.pendientes.indexOf(clave) !== -1;
  const enCompletadas = clave in estado.completadas;
  if (!enPendientes && !enCompletadas) return;

  const indice = estado.pendientes.indexOf(clave);
  if (indice !== -1) {
    estado.pendientes.splice(indice, 1);
  }
  estado.completadas[clave] = valor;
  actualizarEstado(estado);
}

export function pendientes(): string[] {
  const estado = obtenerEstado();
  return estado ? [...estado.pendientes] : [];
}

export function completadas(): Record<string, string> {
  const estado = obtenerEstado();
  return estado ? { ...estado.completadas } : {};
}

export function cerrarEdicion(): void {
  actualizarEstado(null);
}

export function publicarBorrador(): PaqueteIdioma | null {
  const estado = obtenerEstado();
  if (!estado) return null;

  const clavesCompletadas = Object.keys(estado.completadas);
  if (clavesCompletadas.length === 0) return null;

  const entradas: Record<string, string> = {};
  for (const clave of clavesCompletadas) {
    entradas[clave] = estado.completadas[clave];
  }

  const ahora = new Date().toISOString();
  const paqueteSinHash: Omit<PaqueteIdioma, "hash"> = {
    formato: "starseed-idioma",
    version: 1,
    codigo: estado.codigo,
    nombre: estado.nombre,
    dir: "ltr",
    autor: { nombre: "StarSeed OS" },
    creado: ahora,
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas,
  };

  const hash = hashSimple(paqueteSinHash);
  return { ...paqueteSinHash, hash };
}