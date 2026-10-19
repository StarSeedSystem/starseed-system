import type { UsoLicencia } from "@/lib/avatares/adn/adn";
import { ModeloImagen, type MotorImg } from "@/lib/imagenes/modelos";
import { cabe, type Cuantizacion, type NeuronaImg, type HierroImg } from "@/lib/imagenes/plan";
import { preferenciasEfectivas, type CapasPrefs, type Contexto, type ResultadoPreferencias } from "./preferencias-capas";
import type { SistemaNeurona } from "@/lib/imagenes/sugerencias";

/**
 * Plan de instalación por neurona y área.
 * @param neurona - Las capacidades medidas de la neurona.
 * @param catalogo - Catálogo de modelos por área.
 * @param preferencias - Preferencias por capas de conciencia.
 * @param instalados - Modelos ya instalados en la neurona (por área).
 * @returns Qué instalar, actualizar, quitar, obtener desde la malla y motivo por área.
 */
export function planInstalacion(
  neurona: {
    medio: string;
    ramMB: number;
    discoLibreMB: number;
    gpu?: string;
    vramMB?: number;
    apple?: boolean;
    sistema: SistemaNeurona;
  },
  catalogo: Record<string, any>,
  preferencias: CapasPrefs,
  instalados: Record<string, string[]>
): Record<
  string,
  {
    instalar: any[];
    actualizar: any[];
    quitar: any[];
    desdeLaMalla: any[];
    motivo: string;
  }
> {
  // TODO: implement
  return {};
}