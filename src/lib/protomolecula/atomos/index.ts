import { SINTETIZADOR } from "./sintetizador";
import { registrarAtomo, DefinicionAtomo } from "../registro-atomos";

export const ATOMOS_PROPIOS: DefinicionAtomo[] = [
  SINTETIZADOR,
];

export function registrarAtomosPropios(): void {
  for (const atomo of ATOMOS_PROPIOS) {
    registrarAtomo(atomo);
  }
}

export const VISTAS_COMPONENTE: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {};