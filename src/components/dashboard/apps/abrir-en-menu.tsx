"use client";

// Menú «Abrir en…» del lanzador (contrato architecture/apps-en-la-malla.md §12,
// Ola 1017A · tarea O): dónde se abrirá una app, por qué y el resto
// de opciones de la red. Muestra la lista de `opciones-abrir.ts` y llama a
// `onElegir(opcion)`; los textos largos van en una línea con «…» y completos
// al pasar el cursor (title).

import { useState } from "react";
import { ChevronDown, PowerOff, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OfertaNeurona } from "@/lib/recursos/oferta";
import {
  opcionesAbrir,
  type AppAbrir,
  type NeuronaPropia,
  type OpcionAbrir,
} from "@/lib/recursos/opciones-abrir";

interface PropiedadesAbrirEn {
  app: AppAbrir;
  ofertas: OfertaNeurona[];
  neuronaPropia: NeuronaPropia;
  onElegir: (opcion: OpcionAbrir) => void;
  clasesBoton?: string;
}

export function AbrirEnMenu({ app, ofertas, neuronaPropia, onElegir, clasesBoton }: PropiedadesAbrirEn) {
  const [abierto, setAbierto] = useState(false);
  const opciones = opcionesAbrir(app, ofertas, neuronaPropia);
  const elegir = (opcion: OpcionAbrir): void => {
    setAbierto(false);
    onElegir(opcion);
  };
  return (
    <DropdownMenu open={abierto} onOpenChange={setAbierto}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={abierto}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-foreground/90 transition-colors duration-150 hover:bg-accent/60 ${clasesBoton ?? ""}`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Abrir en…
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
        {opciones.map((opcion, indice) => (
          <DropdownMenuItem
            key={`${opcion.destino}-${indice}`}
            disabled={!opcion.disponible}
            onSelect={() => elegir(opcion)}
            className="cursor-pointer gap-2 focus:bg-accent data-[disabled]:opacity-70"
            title={`${opcion.etiqueta} · ${opcion.motivo}`}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{opcion.etiqueta}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {opcion.disponible ? opcion.motivo : `No disponible ahora: ${opcion.motivo}`}
              </span>
            </span>
            {!opcion.disponible && (
              <PowerOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
