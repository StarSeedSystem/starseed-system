"use client";

// src/components/protomolecula/panel-protomolecula.tsx (Ola 1010P · PM1010F0I)
// Panel autónomo de la Protomolécula a pantalla completa. Recibe el id de la
// molécula a abrir (`moleculaId`); sin id, muestra el estado vacío mientras
// llega la sesión.

import { Atom } from "lucide-react";

export interface PanelProtomoleculaAutonomoProps {
  moleculaId?: string;
}

export function PanelProtomoleculaAutonomo({ moleculaId }: PanelProtomoleculaAutonomoProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Atom className="h-8 w-8 text-primary" aria-hidden />
      {moleculaId ? (
        <p className="text-sm">
          Abriendo la molécula <span className="font-mono">{moleculaId}</span>…
        </p>
      ) : (
        <p className="text-sm">Preparando una molécula nueva…</p>
      )}
    </div>
  );
}
