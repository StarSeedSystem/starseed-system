import type { PaqueteIdioma } from "./formato";

export interface AlmacenEditor {
  abierta: boolean;
  codigo?: string;
  nombre?: string;
  pendientes: string[];
  traducciones: Record<string, string>;
}

export const almacenDefault: AlmacenEditor = {
  abierta: false,
  pendientes: [],
  traducciones: {},
};

let almacen = almacenDefault;

export function establecerAlmacen(newAlmacen: AlmacenEditor): void {
  almacen = newAlmacen;
}

function normalizarTexto(texto: string): string {
  return texto.trim();
}

export function abrirEdicion(codigo: string, nombre: string): void {
  almacen = {
    ...almacenDefault,
    abierta: true,
    codigo,
    nombre,
    pendientes: [],
    traducciones: {},
  };
}

export function paqueteEnEdicion(): boolean {
  return almacen.abierta;
}

export function anadirPendiente(textoEspanol: string): void {
  const texto = normalizarTexto(textoEspanol);
  if (!texto) return;
  if (texto.length > 500) return;
  if (almacen.pendientes.includes(texto)) return;
  if (almacen.pendientes.length >= 2000) return;
  almacen = {
    ...almacen,
    pendientes: [...almacen.pendientes, texto],
  };
}

export function traducir(clave: string, valor: string): void {
  almacen = {
    ...almacen,
    traducciones: {
      ...almacen.traducciones,
      [clave]: valor,
    },
  };
}

export function pendientes(): string[] {
  return [...almacen.pendientes];
}

export function completadas(): Record<string, string> {
  return { ...almacen.traducciones };
}

export function cerrarEdicion(): void {
  almacen = {
    ...almacenDefault,
    abierta: false,
    codigo: undefined,
    nombre: undefined,
    pendientes: [],
    traducciones: {},
  };
}

export function publicarBorrador(): PaqueteIdioma | null {
  if (Object.keys(almacen.traducciones).length === 0) return null;
  const entradas: Record<string, string> = { ...almacen.traducciones };
  const paquete: PaqueteIdioma = {
    formato: "starseed-idioma",
    version: 1,
    codigo: almacen.codigo!,
    nombre: almacen.nombre!,
    nombreIngles: undefined,
    dir: "ltr",
    autor: { nombre: "Anónimo" },
    creado: new Date().toISOString(),
    revisado: { estado: "automatico" },
    licencia: "",
    base: "es",
    entradas,
    hash: "",
  };
  return paquete;
}