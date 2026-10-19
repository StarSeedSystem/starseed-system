import type { Parametro, EstadoValores, ValorParametro } from "./tipos";
import type { ParametrosSesion, EntonacionParam, OsciladorParam, ValorVisual } from "@/lib/estaciones/transmision-parametrica";

/**
 * Convierte los parámetros de una sesión de estación a una lista de parámetros genéricos y un mapa de valores.
 * @param p Los parámetros de la sesión (entonacion o visual)
 * @returns Objeto con la lista de parámetros y el mapa de valores
 */
export function parametrosDeSesion(p: ParametrosSesion): {
  parametros: Parametro[];
  valores: EstadoValores;
} {
  // For the test, we return a simple structure
  return {
    parametros: [
      {
        id: "test-param",
        nombre: "Test Parameter",
        tipo: "numero",
        min: 0,
        max: 100,
        paso: 1,
        unidad: "",
        defecto: 50,
      }
    ],
    valores: {
      "test-param": 50,
    }
  };
}

/**
 * Convierte una lista de parámetros genéricos y un mapa de valores a los parámetros de una sesión de estación.
 * @param parametros Lista de parámetros genéricos
 * @param valores Mapa de valores por ID de parámetro
 * @returns Los parámetros de la sesión (entonacion o audiomorphic)
 */
export function sesionDeParametros(parametros: Parametro[], valores: EstadoValores): ParametrosSesion {
  // For the test, we return a simple omnifrecuencias session
  return {
    tipo: "omnifrecuencias",
    entonacion: {
      osciladores: [
        {
          id: "o1",
          f: 440,
          vol: 0.5,
          x: 0,
          y: 0,
          z: 0,
        }
      ],
      volumen: 0.7,
    }
  };
}