"use client";

/*
 * PresenciaNeuronasMount — arranca la presencia en vivo de ESTE medio (2026-10-09).
 * Va en el layout raíz, también en las consolas (/genesis): es un canal de presencia sin
 * consultas a la base de datos, y sin él la Mac no aparecería «activa» mientras se usa Genesis.
 * El módulo se carga perezoso, después del primer pintado (regla del layout raíz).
 */

import { useEffect } from "react";

export function PresenciaNeuronasMount() {
  useEffect(() => {
    let parar: (() => void) | null = null;
    let vivo = true;
    const t = setTimeout(() => {
      void import("@/lib/neurons/presencia")
        .then((m) => {
          if (vivo) parar = m.iniciarPresenciaNeuronas();
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      vivo = false;
      clearTimeout(t);
      parar?.();
    };
  }, []);
  return null;
}

export default PresenciaNeuronasMount;
