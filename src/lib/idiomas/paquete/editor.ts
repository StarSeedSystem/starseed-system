import type { PaqueteIdioma, Autor, Revisado } from "./formato";
import { normalizarTexto } from "../catalogo";

export const CLAVE_EDITOR = "starseed.idiomas.editor.v1" as const;

export interface EstadoEditor {
  codigo: string;
  nombre: string;
  pendientes: Map<string, string>;
  completadas: Map<string, string>;
}

export interface AlmacenEditor {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

const MAX_PENDIENTES = 2000;
const MAX_TEXTO = 500;

let estadoActual: EstadoEditor | null = null;
let almacenInyectado: AlmacenEditor | null = null;

function obtenerAlmacen(): AlmacenEditor {
  if (almacenInyectado) return almacenInyectado;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function guardarEstado(): void {
  if (!estadoActual) return;
  try {
    const serializado = JSON.stringify({
      codigo: estadoActual.codigo,
      nombre: estadoActual.nombre,
      pendientes: Array.from(estadoActual.pendientes.entries()),
      completadas: Array.from(estadoActual.completadas.entries()),
    });
    obtenerAlmacen().setItem(CLAVE_EDITOR, serializado);
  } catch {
    // Ignorar errores de escritura
  }
}

function cargarEstado(): EstadoEditor | null {
  try {
    const bruto = obtenerAlmacen().getItem(CLAVE_EDITOR);
    if (!bruto) return null;
    const parsed = JSON.parse(bruto);
    return {
      codigo: parsed.codigo,
      nombre: parsed.nombre,
      pendientes: new Map(parsed.pendientes ?? []),
      completadas: new Map(parsed.completadas ?? []),
    };
  } catch {
    return null;
  }
}

export function inyectarAlmacen(almacen: AlmacenEditor | null): void {
  almacenInyectado = almacen;
  if (almacen) {
    const cargado = cargarEstado();
    if (cargado) estadoActual = cargado;
  } else {
    estadoActual = null;
  }
}

export function abrirEdicion(codigo: string, nombre: string): void {
  if (!codigo || !nombre) return;
  estadoActual = {
    codigo,
    nombre,
    pendientes: new Map(),
    completadas: new Map(),
  };
  guardarEstado();
}

export function paqueteEnEdicion(): EstadoEditor | null {
  if (!estadoActual) {
    const cargado = cargarEstado();
    if (cargado) estadoActual = cargado;
  }
  return estadoActual;
}

export function anadirPendiente(textoEspanol: string): boolean {
  if (!estadoActual) return false;
  const normalizado = normalizarTexto(textoEspanol);
  if (!normalizado || normalizado.length > MAX_TEXTO) return false;
  if (estadoActual.pendientes.has(normalizado) || estadoActual.completadas.has(normalizado)) {
    return false;
  }
  if (estadoActual.pendientes.size >= MAX_PENDIENTES) return false;
  estadoActual.pendientes.set(normalizado, "");
  guardarEstado();
  return true;
}

export function traducir(clave: string, valor: string): boolean {
  if (!estadoActual) return false;
  if (!estadoActual.pendientes.has(clave)) return false;
  const normalizado = normalizarTexto(valor);
  if (!normalizado) return false;
  estadoActual.pendientes.delete(clave);
  estadoActual.completadas.set(clave, normalizado);
  guardarEstado();
  return true;
}

export function pendientes(): string[] {
  if (!estadoActual) return [];
  return Array.from(estadoActual.pendientes.keys());
}

export function completadas(): Map<string, string> {
  if (!estadoActual) return new Map();
  return new Map(estadoActual.completadas);
}

export function cerrarEdicion(): void {
  estadoActual = null;
  try {
    obtenerAlmacen().removeItem(CLAVE_EDITOR);
  } catch {
    // Ignorar errores
  }
}

export async function publicarBorrador(): Promise<PaqueteIdioma | null> {
  if (!estadoActual) return null;
  if (estadoActual.completadas.size === 0) return null;

  const ahora = new Date().toISOString();
  const autor: Autor = { nombre: "Editor StarSeed" };
  const revisado: Revisado = { estado: "automatico" };
  const entradas = Object.fromEntries(estadoActual.completadas);

  const { construirPaquete } = await import("./formato");
  const paquete = await construirPaquete({
    codigo: estadoActual.codigo,
    nombre: estadoActual.nombre,
    dir: "ltr",
    autor,
    licencia: "MIT",
    entradas,
    revisado,
    creado: ahora,
  });

  return paquete;
}