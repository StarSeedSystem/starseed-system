"use client";

/** Iconos y textos de la interfaz de gobierno de la Protomolécula (Lucide; nunca emojis). */
import { Ban, CheckCircle2, FileText, KeyRound, Palette, Plus, ScrollText, Send, Vote, Wrench } from "lucide-react";
import type { ComponentType } from "react";
import type { TipoCambioProto, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";

type Icono = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export const ICONO_TIPO: Record<TipoCambioProto, Icono> = {
  contenido: FileText,
  diseno: Palette,
  funciones: Wrench,
  permisos: KeyRound,
  reglas: ScrollText,
  creacion: Plus,
};

export const ICONO_DECISION: Record<VeredictoGobierno["decision"], Icono> = { aplicar: CheckCircle2, proponer: Send, votar: Vote, denegar: Ban };

/** Lo que significa cada veredicto PARA TI, en dos palabras. */
export const ETIQUETA_DECISION: Record<VeredictoGobierno["decision"], string> = {
  aplicar: "Lo aplicas",
  proponer: "Propones",
  votar: "Se vota",
  denegar: "No puedes",
};

export const COLOR_DECISION: Record<VeredictoGobierno["decision"], string> = {
  aplicar: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  proponer: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
  votar: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  denegar: "border-white/15 bg-white/5 text-white/55",
};

/** Clases comunes de los controles: objetivo táctil de 44 px, cursor de mano y transición corta. */
export const CLASE_CONTROL =
  "min-h-11 cursor-pointer rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white/90 transition-colors duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

export const CLASE_BOTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-white/90 transition-colors duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
