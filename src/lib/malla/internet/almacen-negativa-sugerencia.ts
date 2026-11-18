"use client";

import { NEGATIVA_HORAS } from "./sugerencia-banco";

type Negativa = {
  en: number;
  conexion: string;
} | null;

export const CLAVE_NEGATIVA = "starseed.malla.internet.sugerencia.v1";

export interface AlmacenSugerencia {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function esNegativaValida(n: unknown): n is Negativa {
  if (typeof n !== "object" || n === null) return false;
  const obj = n as Record<string, unknown>;
  if (typeof obj.en !== "number" || !Number.isFinite(obj.en) || obj.en < 0) return false;
  if (typeof obj.conexion !== "string") return false;
  return true;
}

export function leerNegativa(almacen: AlmacenSugerencia): Negativa {
  try {
    const crudo = almacen.getItem(CLAVE_NEGATIVA);
    if (crudo === null) return null;
    const parseado = JSON.parse(crudo);
    return esNegativaValida(parseado) ? parseado : null;
  } catch {
    return null;
  }
}

export function guardarNegativa(almacen: AlmacenSugerencia, negativa: Negativa | null): boolean {
  try {
    almacen.setItem(CLAVE_NEGATIVA, JSON.stringify(negativa));
    return true;
  } catch {
    return false;
  }
}

function esCliente(): boolean {
  return typeof window !== "undefined";
}