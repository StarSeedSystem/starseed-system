// Astraura: proveedor sin filtros de la nube (MOD1116)
// Módulo puro, sin red, disco ni reloj.

import type { CasoUso } from "./tipos";
import { CASOS_SIN_FILTROS } from "./recomendar";

export const PROVEEDORES_SIN_FILTROS_NUBE = ["abliteration"];

export function proveedorEsSinFiltros(id: string): boolean {
  return PROVEEDORES_SIN_FILTROS_NUBE.includes(id);
}

export interface ResultadoProveedor {
  permitido: boolean;
  aviso: string | null;
}

/**
 * Aplica reglas para usar un proveedor de nube sin filtros.
 * Solo conversaciones privadas propias (privado-propio), interruptor encendido,
 * disponible en perfil, caso permitido, y clave propia.
 */
export function proveedorSinFiltrosPermitido(entrada: {
  activado: boolean;
  disponible: boolean;
  contexto: string; // "privado-propio" | ...
  caso: CasoUso;
  claveDeLaCuenta: string; // "propia" | "otra" | "fundacion"
}): ResultadoProveedor {
  if (!entrada.disponible) {
    return { permitido: false, aviso: "Las variantes sin filtros no están disponibles en este perfil." };
  }
  if (!entrada.activado) {
    return { permitido: false, aviso: "«Mostrar variantes sin filtros» está apagado." };
  }
  if (entrada.contexto !== "privado-propio") {
    return { permitido: false, aviso: "Las variantes sin filtros solo se usan en conversaciones privadas propias." };
  }
  if (!CASOS_SIN_FILTROS.has(entrada.caso)) {
    return { permitido: false, aviso: "Ese uso habla con otras personas o corre sin ti delante." };
  }
  if (entrada.claveDeLaCuenta !== "propia") {
    return { permitido: false, aviso: "No se puede usar la clave de otra cuenta o de la fundación." };
  }
  return { permitido: true, aviso: null };
}
