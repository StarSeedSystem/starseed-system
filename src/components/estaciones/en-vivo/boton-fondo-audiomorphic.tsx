"use client";

/*
 * BotonFondoAudiomorphic (2026-10-10) — lleva los parámetros visuales de la sesión
 * en vivo de Audiomorphic a la CAPA Audiomorphic del fondo del OS. Se REFERENCIA
 * la sesión sincronizada (regla del área: el contenido es entidad única), no se
 * duplica: el fondo lee el mismo visual que pinta el lienzo del panel.
 * SOP: architecture/estaciones-en-vivo-parametricas.md §6.
 */

import { useEffect, useRef, useState } from "react";
import { Wallpaper } from "lucide-react";
import { useAppearance } from "@/context/appearance-context";
import {
  audiomorphicLayer,
  normalizeLayers,
  patchAudiomorphicVisual,
  setAudiomorphicEnabled,
} from "@/lib/appearance/background-layers";

/** Lleva el visual de la sesión en vivo a la capa Audiomorphic del fondo del OS. */
export function BotonFondoAudiomorphic({
  visual,
}: {
  visual: Record<string, number | string | boolean>;
}) {
  const { config, updateConfig } = useAppearance();
  const [aplicado, setAplicado] = useState(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El aviso de «Aplicado al fondo» dura 2 s; el reloj se limpia al desmontar.
  useEffect(() => {
    const id = reloj;
    return () => {
      if (id.current) clearTimeout(id.current);
    };
  }, []);

  const llevar = () => {
    let capas = normalizeLayers(config.background?.layers);
    // Audiomorphic NUNCA arranca solo (CLAUDE.md · background-layers): si la
    // capa no está encendida, se enciende aquí; el fondo base no se toca.
    if (!audiomorphicLayer(capas)) capas = setAudiomorphicEnabled(capas, true);
    const capa = audiomorphicLayer(capas);
    if (!capa) return;
    updateConfig({ background: { layers: patchAudiomorphicVisual(capas, capa.id, visual) } } as never);
    setAplicado(true);
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setAplicado(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={llevar}
      className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 text-sm text-white/85 transition-colors duration-200 hover:border-white/30"
    >
      <Wallpaper className="h-4 w-4" aria-hidden />
      {aplicado ? "Aplicado al fondo" : "Llevar al fondo del OS"}
    </button>
  );
}
