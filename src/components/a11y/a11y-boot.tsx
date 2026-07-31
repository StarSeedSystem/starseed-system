"use client";

import { useEffect } from "react";
import { loadA11ySettings, applyA11yToDocument, injectGlobalA11yStyles } from "@/lib/a11y/apply";

/**
 * A11yBoot (Adenda 118) — aplica los ajustes de accesibilidad EN EL ARRANQUE,
 * no solo cuando se abre el panel de Ajustes. Sin esto, contraste / movimiento
 * reducido / texto grande / daltonismo / tamaño de diana se perdían en cada
 * recarga hasta reabrir Ajustes → Apariencia → Accesibilidad.
 *
 * Reacciona además a cambios sincronizados desde otra neurona/pestaña
 * (starseed:sync:apply, storage). Sin UI. Nunca lanza.
 */
export function A11yBoot() {
  useEffect(() => {
    const apply = () => {
      try {
        injectGlobalA11yStyles();
        applyA11yToDocument(loadA11ySettings());
      } catch {
        /* best-effort */
      }
    };
    apply();
    window.addEventListener("storage", apply);
    window.addEventListener("starseed:sync:apply", apply);
    return () => {
      window.removeEventListener("storage", apply);
      window.removeEventListener("starseed:sync:apply", apply);
    };
  }, []);
  return null;
}

export default A11yBoot;
