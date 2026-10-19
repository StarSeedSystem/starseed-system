"use client";

import { type Operacion, validarOperacion } from "@/lib/genesis/operaciones";
import { type Ambito } from "@/lib/genesis/operaciones";
import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { type CambioAvatar, diffAdn, aplicarCambio } from "@/lib/avatares/adn/cambios";

/**
 * Proponer un cambio de avatar.
 * @param ref ID del avatar (campo ref del AdnAvatar)
 * @param actual ADN actual del avatar
 * @param propuesto ADN propuesto (después de aplicar cambios)
 * @param motivo Razón del cambio
 * @param ambito Ámbito donde se propone la operación (persona o entidad)
 * @returns Resultado de la validación de la operación
 */
export function proponerCambioAvatar(
  ref: string,
  actual: AdnAvatar,
  propuesto: AdnAvatar,
  motivo: string,
  ambito: Ambito
) {
  const cambios = diffAdn(actual, propuesto);
  const operacion: Operacion = {
    tipo: "avatar.cambiar",
    motivo,
    datos: {
      ref,
      revBase: actual.rev,
      cambios,
    },
  };
    return validarOperacion(operacion, { ambito });
}

/**
 * Aplicar un cambio de avatar previamente validado.
 * @param actual ADN actual
 * @param datos Datos de la operación avatar.cambiar (validados)
 * @returns Nuevo ADN después de aplicar los cambios
 */
export function aplicarCambioAvatar(actual: AdnAvatar, datos: { ref: string; revBase: number; cambios: CambioAvatar[] }): AdnAvatar {
   if (datos.revBase !== actual.rev) {
       // revBase mismatch: cannot apply changes safely; return original ADN.
       // The caller should handle the mismatch (e.g., by recalculating the diff and notifying the user).
       return actual;
   }
   // revBase matches: apply changes.
   return datos.cambios.reduce((adn, cambio) => aplicarCambio(adn, cambio), actual);
}