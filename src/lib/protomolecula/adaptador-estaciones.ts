/**
 * Protomolécula · ADAPTADOR ESTACIONES (esbozo F3).
 * De `ParametrosSesion` a `Parametro[]` + `EstadoValores` y viceversa,
 * para que la entonación de una estación se mueva con el mismo panel.
 */
import type { ParametrosSesion, EntonacionParam, OsciladorParam, FuenteTransmision } from "@/lib/estaciones/transmision-parametrica";
import type { Parametro, EstadoValores } from "./tipos";

export interface ResultadoAdaptador {
  parametros: Parametro[];
  valores: EstadoValores;
}

export function parametrosDeSesion(p: ParametrosSesion): ResultadoAdaptador {
  return { parametros: [], valores: {} };
}

export function sesionDesdeParametros(resultado: ResultadoAdaptador, fuente: FuenteTransmision): ParametrosSesion | null {
  return null;
}
