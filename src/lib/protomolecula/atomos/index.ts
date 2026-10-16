/**
 * Protomolécula · ATOMOS PROPIOS (F1C). Conecta los átomos del OS.
 */
import type { ComponentType } from "react";
import type { DefinicionAtomo, VistaProps } from "../registro-atomos";
import { registrarAtomo, obtenerAtomo } from "../registro-atomos";
import { SINTETIZADOR } from "./sintetizador";

export const ATOMOS_PROPIOS: DefinicionAtomo[] = [SINTETIZADOR];

export function registrarAtomosPropios(): void {
  for (const def of ATOMOS_PROPIOS) {
    if (!obtenerAtomo(def.herramientaId)) {
      registrarAtomo(def);
    }
  }
}

export const VISTAS_COMPONENTE: Record<string, () => Promise<{ default: ComponentType<VistaProps> }>> = {};
