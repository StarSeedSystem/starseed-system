"use client";

/**
 * Registro del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 *
 * Lista de las últimas entradas del bucle: hora, quién, qué y motivo. En la ÚLTIMA acción
 * aplicada reversible aparece «Deshacer»; lo irreversible lo dice y no ofrece nada; lo que
 * no deja huella tampoco. Exocórtex leal: todo cambio queda dicho y deshacible si se puede.
 */
import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import type { EntradaRegistro, TipoRegistro } from "@/lib/astraura-bots/bucle";

/** Qué dice cada tipo de entrada, en claro. */
export const TEXTO_TIPO: Record<TipoRegistro, string> = {
  "sentido-on": "Encendió el sentido",
  "sentido-off": "Apagó el sentido",
  "sentido-denegado": "Intentó un sentido sin permiso",
  propuesta: "Propuesta",
  confirmada: "Confirmada",
  rechazada: "Rechazada",
  aplicada: "Aplicada",
  fallo: "Fallo",
  deshecha: "Deshecha",
  pausa: "Pausa",
};
