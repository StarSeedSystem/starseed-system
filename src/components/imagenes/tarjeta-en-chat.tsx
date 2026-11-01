"use client";
/**
 * Imágenes locales de Astraura · TARJETA EN EL CHAT (IMG1011J). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Cuando Astraura genera una imagen en el chat (herramienta `generar_imagen`), aquí aparece la tarjeta
 * con todas las opciones del plan por capas: comparar, variar, editar en la Protomolécula, guardar.
 * No planifica nada por su cuenta: recibe la petición por el evento `starseed:tarjeta-imagenes` que
 * emite la herramienta, y la tarjeta (`TarjetaImagenes`) hace el resto. Si nadie emite, no se pinta.
 */
import { useEffect, useState } from "react";
import { PETICION_DEFECTO } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import type { PeticionImagen } from "@/lib/imagenes/plan";
import { TarjetaImagenes } from "./tarjeta-imagenes";

export const NOMBRE_EVENTO_IMAGENES = "starseed:tarjeta-imagenes";

/** Extrae la petición honesta del detalle del evento: sin prompt usable no hay tarjeta. */
export function peticionDeEvento(
  detalle: unknown,
): (PeticionImagen & { prompt: string }) | null {
  const d = detalle && typeof detalle === "object" ? (detalle as { prompt?: unknown }) : null;
  const prompt = typeof d?.prompt === "string" ? d.prompt.trim() : "";
  if (!prompt) return null;
  return { ...PETICION_DEFECTO, prompt };
}

/** Tarjeta de opciones incrustada en el chat: abre con el evento y se cierra con un toque. */
export default function TarjetaEnChat() {
  const [abierta, setAbierta] = useState(false);
  const [peticion, setPeticion] = useState<(PeticionImagen & { prompt: string }) | null>(null);

  useEffect(() => {
    const alEvento = (ev: Event) => {
      const p = peticionDeEvento((ev as CustomEvent).detail);
      if (!p) return;
      setPeticion(p);
      setAbierta(true);
    };
    try {
      window.addEventListener(NOMBRE_EVENTO_IMAGENES, alEvento);
    } catch {
      /* sin ventana lo de siempre */
    }
    return () => {
      try {
        window.removeEventListener(NOMBRE_EVENTO_IMAGENES, alEvento);
      } catch {
        /* defensiva */
      }
    };
  }, []);

  if (!abierta || !peticion) return null;
  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-cyan-100">Opciones de imagen</h3>
        <button
          type="button"
          onClick={() => setAbierta(false)}
          className="cursor-pointer rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-muted motion-reduce:transition-none"
          aria-label="Cerrar la tarjeta de opciones de imagen"
        >
          Cerrar
        </button>
      </div>
      <TarjetaImagenes peticion={peticion} />
    </div>
  );
}
