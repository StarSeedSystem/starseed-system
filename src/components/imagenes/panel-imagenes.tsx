"use client";

/**
 * Panel incrustable de imágenes locales (IMG1011J). Contrato:
 * `architecture/astraura-imagenes.md` §6.
 *
 * Junta las dos piezas públicas —la tarjeta de opciones y las sugerencias de
 * instalación— detrás de un campo de petición, para que cualquier superficie
 * (chat de Astraura, ajustes de la neurona, Protomolécula) las monte sin
 * reimplementar nada. La generación sigue cayendo a Pollinations: aquí solo
 * se planifica y se elige; no se descarga ningún peso.
 */
import { useId, useState } from "react";

import { PETICION_DEFECTO } from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
import type { PeticionImagen } from "@/lib/imagenes/plan";

import SugerenciasInstalacion from "./sugerencias-instalacion";
import { TarjetaImagenes } from "./tarjeta-imagenes";

export interface PanelImagenesProps {
  titulo?: string;
  descripcion?: string;
  /** Modelos que ya ofrecen otras neuronas de la malla (para no duplicarlos). */
  enLaMalla?: readonly string[];
  /** Marca la petición como uso comercial: el plan descarta modelos no comerciales. */
  comercial?: boolean;
  /** Enseña también el paquete base sugerido para esta neurona. */
  sugerencias?: boolean;
}

export default function PanelImagenes({
  titulo = "Imágenes de Astraura",
  descripcion = "Pide una imagen y Astraura reparte el trabajo por capas: tu aparato, tus neuronas, la malla o la web gratis.",
  enLaMalla = [],
  comercial = false,
  sugerencias = false,
}: PanelImagenesProps) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [peticion, setPeticion] = useState<PeticionImagen | null>(null);

  function generar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const prompt = texto.trim();
    if (!prompt) {
      setError("Escribe qué imagen quieres generar.");
      return;
    }
    setError("");
    setIntento((n) => n + 1);
    setPeticion({ ...PETICION_DEFECTO, opciones: 4, comercial, necesita: [] });
  }

  return (
    <section aria-label={titulo} className="space-y-3 rounded-xl border border-border bg-card p-3 text-foreground">
      <header className="space-y-0.5">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{descripcion}</p>
      </header>
      <form onSubmit={generar} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">Qué imagen quieres</label>
        <input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Un bosque de cristal al amanecer…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 motion-reduce:transition-none"
        >
          Ver opciones
        </button>
      </form>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {peticion ? (
        <TarjetaImagenes key={intento} peticion={peticion} />
      ) : (
        <p className="text-xs text-muted-foreground">Aún sin petición: elige el modelo, el motor y la capa antes de generar. Nada se descarga solo.</p>
      )}
      {sugerencias && <SugerenciasInstalacion enLaMalla={[...enLaMalla]} comercial={comercial} />}
    </section>
  );
}
