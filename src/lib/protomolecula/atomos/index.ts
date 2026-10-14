/**
 * Protomolécula · ÍNDICE DE ÁTOMOS PROPIOS (los que escribe el OS).
 * `registrarAtomosPropios()` es idempotente: solo añade los que falten.
 * `VISTAS_COMPONENTE` resuelve las vistas de tipo «componente» (vacío de momento; PM1010F1E añade el suyo).
 * Contrato: architecture/protomolecula.md §11.1.
 */
import type { ComponentType } from "react";
import { obtenerAtomo, registrarAtomo } from "../registro-atomos";
import type { DefinicionAtomo, VistaProps } from "../registro-atomos";
import { SINTETIZADOR } from "./sintetizador";

export const ATOMOS_PROPIOS: DefinicionAtomo[] = [SINTETIZADOR];

export function registrarAtomosPropios(): void {
  for (const def of ATOMOS_PROPIOS) {
    if (!obtenerAtomo(def.herramientaId)) registrarAtomo(def);
  }
}

export const VISTAS_COMPONENTE: Record<
  string,
  () => Promise<{ default: ComponentType<VistaProps> }>
> = {};
