"use client";
/**
 * Filtro «Bots de IA» de UNA publicación (Ola 1025U · U3): qué bots se ven en sus comentarios. Se coloca en la
 * cabecera del hilo. `Según la entidad` quita la regla propia y vuelve a la de la página, grupo o comunidad.
 */
import { useState } from "react";
import { Bot } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { permitirBotsEn, ETIQUETA_MODO_BOTS } from "@/lib/agentes-red/bloqueo-bots";
import { useReglasBloqueoBots } from "@/lib/agentes-red/use-agentes-red";
import { SelectorModoBots, type OpcionModoBots } from "./selector-modo-bots";

const OPCIONES: readonly OpcionModoBots[] = [
  { valor: null, etiqueta: "Según la entidad", detalle: "Sigue la regla de esta página, grupo o comunidad." },
  { valor: "todo", etiqueta: ETIQUETA_MODO_BOTS.todo },
  { valor: "solo-entidad", etiqueta: ETIQUETA_MODO_BOTS["solo-entidad"], detalle: "Solo los agentes que son de esta entidad." },
  { valor: "ninguno", etiqueta: ETIQUETA_MODO_BOTS.ninguno },
];

export function FiltroBotsPublicacion({ postId }: { postId: string }) {
  const reglas = useReglasBloqueoBots();
  const [abierto, setAbierto] = useState(false);
  const propio = reglas.publicaciones[postId] ?? null;
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="filtro-bots-publicacion"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70"
        >
          <Bot className="size-4 text-sky-300" aria-hidden="true" />
          Bots de IA{propio ? `: ${ETIQUETA_MODO_BOTS[propio].toLowerCase()}` : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-3 backdrop-blur-xl">
        <p className="mb-2 text-xs text-white/55">Qué bots ves en los comentarios de esta publicación.</p>
        <SelectorModoBots
          etiquetaGrupo="Bots en los comentarios de esta publicación"
          valor={propio}
          opciones={OPCIONES}
          alCambiar={(modo) => permitirBotsEn(postId, modo)}
        />
      </PopoverContent>
    </Popover>
  );
}
