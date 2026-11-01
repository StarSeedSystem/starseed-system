"use client";
/**
 * Protomolécula · VISTA DEL ÁTOMO «Opciones de imagen de Astraura» (IMG1011J).
 * Contrato: architecture/astraura-imagenes.md §6. Se pinta como componente NUESTRO
 * (marco-aislado → VISTAS_COMPONENTE): recoje el prompt en la propia vista, aplica el
 * parámetro `opciones` dictado a la molécula y da la palabra a la tarjeta real
 * (`TarjetaImagenes`), que planifica por capas sin modificar el núcleo puro.
 */
import { useMemo, useState } from "react";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";
import { PETICION_DEFECTO } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import type { PeticionImagen } from "@/lib/imagenes/plan";
import { TarjetaImagenes } from "@/components/imagenes/tarjeta-imagenes";
import { opcionesTarjeta } from "@/lib/protomolecula/atomos/imagen-tarjeta";

export interface VistaTarjetaImagenesProps extends VistaProps {
  /** Semilla del prompt para las pruebas; en vivo lo escribe la persona. */
  promptInicial?: string;
}

export default function VistaTarjetaImagenes({
  valores,
  promptInicial = "",
}: VistaTarjetaImagenesProps) {
  const [prompt, setPrompt] = useState(promptInicial);
  const [lista, setLista] = useState(false);
  const opciones = useMemo(() => opcionesTarjeta(valores.opciones), [valores.opciones]);
  const peticion: PeticionImagen & { prompt?: string } = useMemo(
    () => ({ ...PETICION_DEFECTO, opciones, prompt: lista ? prompt : undefined }),
    [lista, opciones, prompt],
  );
  const listo = lista && prompt.trim().length > 0;

  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="text-xs text-muted-foreground" htmlFor="pm-imagenes-prompt">
            ¿Qué imagen quieres? Escríbeselo a Astraura y prepara las opciones.
          </label>
          <input
            id="pm-imagenes-prompt"
            type="text"
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setLista(false); }}
            placeholder="Una estación en la órbita de Saturno…"
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={!prompt.trim()}
          onClick={() => setLista(true)}
          className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          aria-label={`Preparar ${opciones} opciones de imagen`}
        >
          Preparar opciones
        </button>
      </div>
      {listo ? (
        <TarjetaImagenes peticion={peticion} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Escribe la petición y Astraura reparte por capas: tu aparato, tu PC, otra neurona, la malla o la web gratis.
        </p>
      )}
    </div>
  );
}
