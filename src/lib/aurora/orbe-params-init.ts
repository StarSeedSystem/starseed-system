"use client";
import { crearCanalOrbeParams, puenteBusACanal, type DepsCanalOrbeParams } from "./canal-orbe-params";

let desenganchar: (() => void) | null = null;

export function inicializarCanalOrbeParams(deps: DepsCanalOrbeParams): () => void {
  if (desenganchar) return () => {};
  const canal = crearCanalOrbeParams(deps);
  desenganchar = puenteBusACanal(canal);
  return () => {
    if (desenganchar) {
      desenganchar();
      desenganchar = null;
    }
    canal.cerrar();
  };
}

export function terminarCanalOrbeParams(): void {
  if (desenganchar) {
    desenganchar();
    desenganchar = null;
  }
}