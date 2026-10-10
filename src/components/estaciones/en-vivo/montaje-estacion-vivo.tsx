"use client";

/*
 * EstacionVivoMontaje (2026-10-10) — montaje GLOBAL (layout raíz) de las estaciones en vivo.
 * Diminuto a propósito: no importa nada pesado. Carga el minicontrol, el motor y el puente con la
 * app oficial SOLO cuando hace falta:
 *   · había una estación sintonizada antes de recargar (`starseed.estaciones.sintonizada.v1`);
 *   · alguien pide sintonizar (`starseed:estacion-sintonizar` con `{ href }`);
 *   · la app oficial de Omnifrecuencias/Audiomorphic, en su marco, habla el protocolo
 *     (`{ ss: "estacion" }`); el puente verifica el origen antes de atender nada.
 * SOP: architecture/estaciones-en-vivo-parametricas.md §5.3 y §7.
 */

import { useEffect, useState, type ComponentType } from "react";

export function EstacionVivoMontaje() {
  const [Mini, setMini] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cargado = false;
    const cargar = () => {
      if (cargado) return;
      cargado = true;
      void import("./minicontrol-estacion")
        .then((m) => setMini(() => m.MinicontrolEstacion))
        .catch(() => {
          cargado = false;
        });
    };
    try {
      if (window.localStorage.getItem("starseed.estaciones.sintonizada.v1")) cargar();
    } catch {
      /* sin almacenamiento */
    }
    const alPedir = (ev: Event) => {
      const href = (ev as CustomEvent<{ href?: string }>).detail?.href;
      cargar();
      if (typeof href === "string") {
        void import("@/lib/estaciones/estacion-global").then((m) => m.estacionGlobal().sintonizar(href));
      }
    };
    const alMensaje = (ev: MessageEvent) => {
      const d = ev.data as { ss?: unknown } | null;
      if (!d || typeof d !== "object" || d.ss !== "estacion" || ev.source === window) return;
      window.removeEventListener("message", alMensaje);
      cargar();
      void import("@/lib/estaciones/puente-omnifrecuencias").then((m) => m.instalarPuenteEstaciones(ev));
    };
    window.addEventListener("starseed:estacion-sintonizar", alPedir);
    window.addEventListener("message", alMensaje);
    return () => {
      window.removeEventListener("starseed:estacion-sintonizar", alPedir);
      window.removeEventListener("message", alMensaje);
    };
  }, []);

  return Mini ? <Mini /> : null;
}

export default EstacionVivoMontaje;
