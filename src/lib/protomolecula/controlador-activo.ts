/**
 * Protomolécula · CONTROLADOR ACTIVO. Registro simple del controlador en uso.
 * Módulo PURO: sin React, sin red, sin `node:*`. Solo un mapa interno.
 */
import type { Controlador } from "./controlador";

const CONTROLADORES = new Map<string, Controlador>();
let ordenRegistro: string[] = [];

export function registrarControlador(moleculaId: string, c: Controlador): () => void {
  CONTROLADORES.set(moleculaId, c);
  ordenRegistro.push(moleculaId);
  return () => {
    CONTROLADORES.delete(moleculaId);
    ordenRegistro = ordenRegistro.filter((id) => id !== moleculaId);
  };
}

export function controladorActivo(moleculaId?: string): Controlador | null {
  if (moleculaId) return CONTROLADORES.get(moleculaId) ?? null;
  const ultimo = ordenRegistro[ordenRegistro.length - 1];
  return ultimo ? CONTROLADORES.get(ultimo) ?? null : null;
}

export function listarControladores(): Controlador[] {
  return ordenRegistro.map((id) => CONTROLADORES.get(id)!).filter(Boolean);
}

export function limpiarControladores(): void {
  CONTROLADORES.clear();
  ordenRegistro = [];
}