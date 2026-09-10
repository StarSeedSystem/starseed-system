"use client";

/*
 * ArranqueNucleo — cableado ÚNICO del núcleo intocable de StarSeed OS.
 * -------------------------------------------------------------------
 * `src/lib/nucleo/paquete-sistema.ts` no importa a sus guardianes: se los
 * INYECTAN al arrancar con `configurarNucleo({ validarUiSpec,
 * validarContraInvariantes })`. Mientras nadie los registre, `revisar` falla
 * CERRADO —devuelve la violación «nucleo-configurado» y nada es instalable—,
 * que es el fallo correcto pero deja la Biblioteca inservible.
 *
 * Este módulo es ese registro, y vive aquí por dos razones:
 *   1) es un montaje de sistema sin UI, hermano de SovereignSyncMount y de
 *      A11yBoot, y el layout RAÍZ (`src/app/layout.tsx`) ya es donde el OS
 *      arranca todo lo global — no hacía falta inventar otro arranque;
 *   2) al ser un módulo de CLIENTE renderizado desde el layout raíz, se
 *      evalúa en los dos lados: en el servidor al pintar el SSR de cualquier
 *      ruta, y en el navegador al cargar su fragmento. El editor del OS y la
 *      Biblioteca (que son quienes llaman a `revisar`) viven en el cliente.
 *
 * Idempotente por partida triple: la evaluación del módulo ocurre una sola vez
 * por entorno, `arrancarNucleo` no vuelve a registrar si ya hay guardianes, y
 * el efecto de montaje (que React 19 en modo estricto invoca dos veces) sale
 * por la misma puerta. Sin UI y sin excepciones.
 */

import { useEffect } from "react";
import { validarUiSpec } from "@/lib/nucleo/ui-spec";
import { validarContraInvariantes } from "@/lib/nucleo/invariantes";
import { configurarNucleo, nucleoRegistrado } from "@/lib/nucleo/paquete-sistema";

/**
 * Registra los guardianes del núcleo si aún no lo están.
 * Devuelve `true` sólo la primera vez (útil en pruebas y diagnóstico).
 */
export function arrancarNucleo(): boolean {
  if (nucleoRegistrado()) return false;
  configurarNucleo({ validarUiSpec, validarContraInvariantes });
  return true;
}

// Al EVALUAR el módulo, antes de que se monte nada: si una ruta revisa un
// paquete durante su primer render (servidor o cliente), el núcleo ya está
// puesto y la revisión es de verdad, no un fallo cerrado.
arrancarNucleo();

/** Montaje sin UI para el layout raíz: deja el núcleo cableado toda la sesión. */
export function ArranqueNucleo(): null {
  useEffect(() => {
    arrancarNucleo();
  }, []);
  return null;
}

export default ArranqueNucleo;
