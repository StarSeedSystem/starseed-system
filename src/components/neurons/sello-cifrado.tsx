"use client";

/**
 * SelloCifrado — candado «cifrado» o aviso «sin cifrar» junto a la vía («vía red local») de una neurona
 * (CIF1108A · 2026-11-08). Lee `cifradoDe()`; sin enlace directo ligado no pinta nada.
 */

import { AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCifradoNeurona } from "@/lib/malla/use-cifrado-enlace";
import type { EtiquetaCifrado } from "@/lib/malla/sesion-cifrada";

const TEXTO: Record<EtiquetaCifrado, { texto: string; titulo: string; clase: string }> = {
  cifrado: { texto: "cifrado", titulo: "El enlace directo va cifrado de punta a punta.", clase: "text-emerald-300/90" },
  pendiente: { texto: "cifrando…", titulo: "Acordando la clave de sesión del enlace directo.", clase: "text-white/45" },
  "sin-cifrar": {
    texto: "sin cifrar",
    titulo: "Esa neurona tiene una app anterior que no cifra el enlace directo. Actualízala, o activa «Exigir cifrado en la red local» en Ajustes.",
    clase: "text-amber-300/90",
  },
};

export function SelloCifradoVista({ estado, className }: { estado: EtiquetaCifrado | null; className?: string }) {
  if (!estado) return null;
  const t = TEXTO[estado];
  const Icono = estado === "sin-cifrar" ? AlertTriangle : Lock;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap", t.clase, className)} title={t.titulo} data-testid="sello-cifrado" data-estado={estado}>
      <Icono className="h-3 w-3 shrink-0" aria-hidden />
      {t.texto}
    </span>
  );
}

export function SelloCifrado({ neuronaId, className }: { neuronaId: string; className?: string }) {
  return <SelloCifradoVista estado={useCifradoNeurona(neuronaId)} className={className} />;
}
