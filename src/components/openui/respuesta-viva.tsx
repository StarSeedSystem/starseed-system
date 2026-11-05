"use client";

/**
 * Respuesta viva · OpenUI Lang en los chats de StarSeed OS.
 * ---------------------------------------------------------------------------
 * La biblioteca Trinity vive en `src/lib/openui/biblioteca.tsx`; aquí solo se
 * APLICA: se detecta si el mensaje es un programa OpenUI Lang (el prompt exige
 * `root = Componente(...)` en la primera línea) y, si lo es, se pinta con el
 * `Renderer` de OpenUI. Cualquier otra cosa sigue por el renderizador de
 * siempre: si el modelo no devuelve OpenUI Lang válido, nunca hay pantalla
 * rota. Los `Accion` solo emiten un evento; nada se ejecuta aquí.
 */

import { Renderer } from "@openuidev/react-lang";
import { biblioteca } from "@/lib/openui/biblioteca";

/** Componentes de la biblioteca que pueden ser la raíz del programa. */
const COMPONENTES = [
  "Tarjeta",
  "Tabla",
  "Pasos",
  "Comparacion",
  "LineaDeTiempo",
  "Lista",
  "Accion",
] as const;

/**
 * ¿El texto es un programa OpenUI Lang y no prosa? Pura: no toca red ni DOM.
 * Acepta el programa tal cual o entero dentro de un bloque ```openui …```;
 * si el bloque convive con prosa, NO se secuestra el mensaje.
 */
export function esInterfazViva(texto: string): boolean {
  const limpio = (texto || "").trim();
  if (!limpio) return false;

  const bloque = limpio.match(/^```[\w.+-]*[ \t]*\r?\n([\s\S]*?)\r?\n```$/);
  if (!bloque && limpio.includes("```")) return false;

  const primera = (bloque ? bloque[1] : limpio).split(/\r?\n/, 1)[0]?.trim() ?? "";
  const nombres = COMPONENTES.join("|");
  return new RegExp(`^root\\s*=\\s*(?:${nombres})\\s*\\(`).test(primera);
}

/** Pinta una respuesta OpenUI Lang con la biblioteca Trinity del OS. */
export function RespuestaViva({ texto }: { texto: string }) {
  return (
    <Renderer
      response={texto}
      library={biblioteca}
      onAction={(evento) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("starseed:openui-accion", { detail: evento }));
      }}
    />
  );
}
