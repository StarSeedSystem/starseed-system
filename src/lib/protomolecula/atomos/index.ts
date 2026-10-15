import { DefinicionAtomo } from "../registro-atomos";
import { SINTETIZADOR } from "./sintetizador";

/** Átomos propios de la Protomolécula (fase F1). */
export const ATOMOS_PROPIOS: DefinicionAtomo[] = [
  SINTETIZADOR,
];

/** Registra los átomos propios que aún no estén en el registro global. */
export function registrarAtomosPropios(): void {
  for (const atomo of ATOMOS_PROPIOS) {
    const existente = window['PROTOMOLECULA_REGISTRO']?.obtenerAtomo(atomo.herramientaId);
    if (!existente) {
      window['PROTOMOLECULA_REGISTRO']?.registrarAtomo(atomo);
    }
  }
}

/** Mapeo de vistas por componente (se llena en fases posteriores). */
export const VISTAS_COMPONENTE: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {};