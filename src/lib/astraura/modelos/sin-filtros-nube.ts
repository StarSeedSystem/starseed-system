// Proveedor sin filtros en la nube (MOD1116). Módulo PURO: sin red, sin disco, sin DOM.
// Regla: solo se sirve en privado-propio, con el interruptor encendido y disponible, caso permitido,
// y la cuenta tiene su propia clave (nunca la de otra persona ni la de la fundación).

import type { CasoUso, ModeloLocal } from "./tipos";
import type { PerfilNeurona } from "./perfil-neurona";
import type { EstadoSinFiltros } from "./variantes";
import { CASOS_SIN_FILTROS } from "./recomendar";

export const PROVEEDORES_SIN_FILTROS_NUBE = ["abliteration"] as const;
export type ProveedorSinFiltros = typeof PROVEEDORES_SIN_FILTROS_NUBE[number];

export function proveedorEsSinFiltros(id: string): boolean {
  return PROVEEDORES_SIN_FILTROS_NUBE.includes(id as ProveedorSinFiltros);
}

export interface ResultadoSinFiltrosNube {
  permitido: boolean;
  aviso: string | null;
}

export interface ParamsSinFiltrosNube {
  activado: boolean;
  disponible: boolean;
  contexto: CasoUso | "omitido";
  caso: CasoUso;
  claveDeLaCuenta: string | null;
}

export function proveedorSinFiltrosPermitido({
  activado,
  disponible,
  contexto,
  caso,
  claveDeLaCuenta,
}: ParamsSinFiltrosNube): ResultadoSinFiltrosNube {
  if (!disponible) {
    return { permitido: false, aviso: "Las variantes sin filtros no están disponibles en este perfil." };
  }
  if (!activado) {
    return { permitido: false, aviso: "«Mostrar variantes sin filtros» está apagado." };
  }
  const ctx = contexto === "omitido" ? "compartido" : contexto;
  if (ctx !== "privado-propio") {
    return { permitido: false, aviso: `solo se usan en tus conversaciones privadas en tu neurona, no en ${ctx}.` };
  }
  if (!CASOS_SIN_FILTROS.has(caso)) {
    return { permitido: false, aviso: "ese uso habla con otras personas o corre sin ti delante." };
  }
  if (!claveDeLaCuenta) {
    return { permitido: false, aviso: "no se sirve a otra cuenta ni por la malla." };
  }
  return { permitido: true, aviso: null };
}